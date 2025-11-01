const express = require("express");
const session = require("express-session");
const path = require("path");
require("dotenv").config();
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const { randomInt, randomUUID } = require("crypto");
const nodemailer = require("nodemailer");
const fs = require("fs");

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


// connection
// account
const accountDB = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "AccountDB",
});

accountDB.connect((err) => {
    if (err) {
        console.error("Lỗi kết nối MySQL:", err);
        return;
    }
    console.log("Đã kết nối accountDB thành công!");
});

// fee
const feeDB = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "FeeDB",
});

feeDB.connect((err) => {
    if (err) {
        console.error("Lỗi kết nối MySQL:", err);
        return;
    }
    console.log("Đã kết nối feeDB thành công!");
});

// otp
const otpDB = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "OtpDB",
});

otpDB.connect((err) => {
    if (err) {
        console.error("Lỗi kết nối MySQL:", err);
        return;
    }
    console.log("Đã kết nối otpDB thành công!");
});

// Session
app.use(session({
    secret: "my-secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 150,     // 15 phút        
    }
}));

// login page
app.get("/", (req, res) => {
    res.redirect("/index");
});

app.get("/index", (req, res) => {
    res.render("index", { error: null });
});

// Route login
app.post("/api/login", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }

    const sql = "select UserID, Username, Pwd from Account where Username = ?";
    accountDB.query(sql, [username], (err, results) => {
        if (err) {
            console.error("MySQL error:", err);
            return res.status(500).json({ message: "Internal server error." });
        }

        if (results.length > 0) {
            const user = results[0];
            if (password === user.Pwd) {
                req.session.userid = user.UserID;
                req.session.username = user.Username;

                const token = `fake-jwt-token-${req.session.userid}`;

                // return information user json
                const sql2 = "select * from Users where UserID = ?";
                accountDB.query(sql2, [user.UserID], (err2, rows) => {
                    if (err2) {
                        console.error("MySQL error:", err2);
                        return res.status(500).json({ message: "Internal server error." });
                    }
                    return res.json({
                        message: "Login success",
                        user: { id: user.UserID, username: user.Username },
                        details: rows.length > 0 ? rows[0] : null,
                        token: token
                    });
                });
            }
            else {
                return res.status(401).json({ message: "Invalid password" });
            }
        }
        else {
            return res.status(404).json({ message: "Invalid username" });
        }
    });
});

// look up tuiton
app.get("/api/students", (req, res) => {
    const mssv = req.query.mssv?.trim();

    if (!mssv) {
        return res.status(400).json({ message: "Vui lòng nhập MSSV" });
    }

    const sql = "SELECT * FROM Fee WHERE StudentID = ?";

    feeDB.query(sql, [mssv], (err, results) => {
        if (err) return res.status(500).json({ message: "Internal server error." });

        if (results.length === 0) {
            return res.json({
                student: { mssv: "-", full_name: "-" },
                invoice: { amount_due: 0, amount_paid: 0, status: "Không tìm thấy sinh viên" }
            });
        }

        const row = results[0];

        res.json({
            student: {
                mssv: row.StudentID || "-",
                full_name: row.StudentFullname || "-"
            },
            invoice: {
                amount_due: row.Fee || 0,
                amount_paid: row.Fee === 0 ? row.Fee : 0,
                status: row.State === 1 ? "Đã đóng" : "Nợ học phí"
            }
        });
    });
});


// otp
app.post("/api/payments/otp", (req, res) => {
    const mssv = req.body.mssv;
    const clientIdempotencyKey = req.body.idempotencyKey;

    const authHeader = req.headers.authorization;
    const userId = authHeader?.split("-").pop(); 

    if (!mssv) return res.status(400).json({ message: "Thiếu MSSV" });

    accountDB.query("SELECT Email FROM Users WHERE UserID = ?", [userId], (err, results) => {
        if (err) return res.status(500).json({ message: "Internal server error" });
        if (results.length === 0) return res.status(404).json({ message: "Không tìm thấy email" });

        const userEmail = results[0].Email;

        feeDB.query("SELECT PaymentID FROM Fee WHERE StudentID = ?", [mssv], (errFee, feeRows) => {
            if (errFee) return res.status(500).json({ message: "Internal server error" });
            if (feeRows.length === 0) return res.status(404).json({ message: "Không tìm thấy học phí sinh viên" });

            const paymentId = feeRows[0].PaymentID;

            // Check if client provided an idempotency key and if it exists
            if (clientIdempotencyKey) {
                otpDB.query(
                    "SELECT * FROM IdempotencyKey WHERE KeyUUID = ? AND UserID = ? AND LastUsedTx = ?",
                    [clientIdempotencyKey, userId, paymentId],
                    (errKey, keyRows) => {
                        if (errKey) return res.status(500).json({ message: "Internal server error" });

                        if (keyRows.length > 0) {
                            // Key exists, try to reuse existing OTP
                            otpDB.query(
                                "SELECT * FROM Otp WHERE IdempotencyKey = ? AND State = FALSE ORDER BY CreatedAt DESC LIMIT 1",
                                [clientIdempotencyKey],
                                (errOtp, otpRows) => {
                                    if (errOtp) return res.status(500).json({ message: "Internal server error" });

                                    // Nếu tồn tại OTP còn hạn
                                    if (otpRows.length > 0) {
                                        const existingOtp = otpRows[0];
                                        const now = Date.now();
                                        const expiredAt = new Date(existingOtp.ExpiredAt).getTime();

                                        if (expiredAt > now) {
                                            // OTP còn hạn → không gửi lại, không tạo OTP mới
                                            return res.json({
                                                payment_id: paymentId,
                                                otp_id: existingOtp.OtpID,
                                                expiredAt: existingOtp.ExpiredAt,
                                                idempotencyKey: clientIdempotencyKey,
                                                message: `OTP vẫn còn hiệu lực. Vui lòng kiểm tra email ${userEmail} để nhập mã OTP (6 chữ số).`
                                            });
                                        }
                                    }

                                    // Nếu OTP đã hết hạn hoặc chưa từng tồn tại → tạo/gửi mới
                                    otpDB.query("SELECT * FROM Otp WHERE IdempotencyKey = ? LIMIT 1",
                                        [clientIdempotencyKey], (errFind, otpAllRows) => {
                                            if (errFind)
                                                return res.status(500).json({ message: "Internal server error" });

                                            const otp = Math.floor(100000 + Math.random() * 900000).toString();
                                            const expiredAt = new Date(Date.now() + 60 * 1000);

                                            if (otpAllRows.length > 0) {
                                                const otp_id = otpAllRows[0].OtpID;

                                                otpDB.query(
                                                    "UPDATE Otp SET OtpCode = ?, ExpiredAt = ?, State = FALSE, CreatedAt = NOW() WHERE OtpID = ?",
                                                    [otp, expiredAt, otp_id],
                                                    (errUpdate) => {
                                                        if (errUpdate)
                                                            return res.status(500).json({ message: "Internal server error" });

                                                        sendOtpMail(userEmail, otp);

                                                        // Auto mark expired
                                                        const delay = expiredAt.getTime() - Date.now();
                                                        setTimeout(() => {
                                                            otpDB.query(
                                                                "UPDATE Otp SET State = TRUE WHERE OtpID = ?",
                                                                [otp_id],
                                                                (err3) => {
                                                                    if (err3)
                                                                        console.error("Lỗi mark OTP hết hạn:", err3);
                                                                }
                                                            );
                                                        }, delay);

                                                        return res.json({
                                                            payment_id: paymentId,
                                                            otp_id,
                                                            expiredAt,
                                                            idempotencyKey: clientIdempotencyKey,
                                                            message: `Mã OTP mới đã được gửi lại ${userEmail}.`
                                                        });
                                                    });
                                            }
                                            else {
                                                // Không có OTP nào trước đó → tạo mới
                                                createNewOtp(clientIdempotencyKey, null, paymentId);
                                            }
                                        }
                                    );
                                }
                            );
                        }
                        else {
                            // Key doesn't exist, create new one
                            createIdempotencyKeyAndOtp(null, paymentId);
                        }
                    });
            }
            else {
                // No client key provided, create new one
                createIdempotencyKeyAndOtp(null, paymentId);
            }
        });

        function createIdempotencyKeyAndOtp(existingKey, paymentId) {
            const idempotencyKey = existingKey || randomUUID();

            otpDB.query(
                "INSERT INTO IdempotencyKey (KeyUUID, UserID, LastUsedTx) VALUES (?, ?, ?)",
                [idempotencyKey, userId, paymentId],
                (errInsertKey) => {
                    if (errInsertKey) {
                        console.error("Lỗi tạo IdempotencyKey:", errInsertKey);
                        return res.status(500).json({ message: "Internal server error" });
                    }
                    createNewOtp(idempotencyKey, null, paymentId);
                }
            );
        }

        function createNewOtp(idempotencyKey, otp_id = null, payment_id) {

            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiredAt = new Date(Date.now() + 60 * 1000);

            if (otp_id === null) {
                otp_id = randomInt(100000, 1000000).toString();
            }

            otpDB.query(
                "INSERT INTO Otp (OtpID, IdempotencyKey, Email, OtpCode, ExpiredAt) VALUES (?, ?, ?, ?, ?)",
                [otp_id, idempotencyKey, userEmail, otp, expiredAt],
                (err2) => {
                    if (err2) {
                        console.error("Lỗi lưu OTP:", err2);
                        return res.status(500).json({ message: "Internal server error" });
                    }

                    otpDB.query(
                        "UPDATE IdempotencyKey SET LastUsedTx = ? WHERE KeyUUID = ?",
                        [payment_id, idempotencyKey],
                        (errUpdate) => { if (errUpdate) console.error("Lỗi cập nhật LastUsedTx:", errUpdate); }
                    );

                    const delay = expiredAt.getTime() - Date.now();
                    setTimeout(() => {
                        otpDB.query(
                            "UPDATE Otp SET State = TRUE WHERE OtpID = ?",
                            [otp_id],
                            (err3) => { if (err3) console.error("Lỗi mark OTP hết hạn:", err3); }
                        );
                    }, delay);

                    sendOtpMail(userEmail, otp);

                    res.json({
                        payment_id,
                        otp_id,
                        expiredAt,
                        idempotencyKey,
                        message: `Nhập mã OTP (6 chữ số) vừa được gửi ${userEmail}.`
                    });
                }
            );
        }

        function sendOtpMail(to, otpCode) {
            const template = fs.readFileSync(path.join(__dirname, "views", "otpEmail.html"), "utf8");
            const htmlContent = template.replace("{{OTP_CODE}}", otpCode);

            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            });

            transporter.sendMail({
                from: process.env.EMAIL_USER,
                to,
                subject: "Mã OTP thanh toán học phí",
                html: htmlContent,
            }).catch(err => console.error("Lỗi gửi email:", err));
        }
    });
});

// confirm otp
app.post("/api/payments/:paymentId/confirm", (req, res) => {
    const paymentId = req.params.paymentId;
    const { otp, mssv, idempotencyKey } = req.body;
    const otp_id = req.query.otp_id;

    if (!otp_id || !otp || !mssv) {
        return res.status(400).json({ message: "Thiếu otp hoặc otp_id hoặc mssv" });
    }

    if (!idempotencyKey) {
        return res.status(400).json({ message: "Thiếu idempotencyKey" });
    }

    feeDB.query("SELECT * FROM Fee WHERE StudentID = ?", [mssv], (err, result) => {
        if (err) {
            console.error("MySQL error:", err);
            return res.status(500).json({ message: "Internal server error" });
        }

        if (result.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy sinh viên" });
        }

        const row = result[0];

        if (row.State === 1) {
            return res.status(400).json({ message: "Sinh viên này đã được thanh toán trước đó." });
        }

        // Validate idempotency key belongs to current user
        const authHeader = req.headers.authorization;
        const userId = authHeader?.split("-").pop(); 
        
        otpDB.query(
            "SELECT * FROM IdempotencyKey WHERE KeyUUID = ?",
            [idempotencyKey],
            (errKey, keyResults) => {
                if (errKey) return res.status(500).json({ message: "Internal server error" });
                if (keyResults.length === 0) return res.status(400).json({ message: "IdempotencyKey không hợp lệ" });

                const keyRecord = keyResults[0];
                if (keyRecord.UserID && keyRecord.UserID !== userId) {
                    return res.status(403).json({ message: "IdempotencyKey không thuộc về người dùng này" });
                }

                // Check OTP validity
                otpDB.query(
                    "SELECT * FROM Otp WHERE OtpID = ? AND IdempotencyKey = ? AND State = FALSE AND ExpiredAt > NOW()",
                    [otp_id, idempotencyKey],
                    (err, results) => {
                        if (err) return res.status(500).json({ message: "Internal server error" });
                        if (results.length === 0) return res.status(400).json({ message: "OTP không hợp lệ hoặc đã hết hạn" });

                        const record = results[0];
                        if (record.OtpCode !== otp) return res.status(400).json({ message: "OTP không đúng" });

                        // Mark OTP as used
                        otpDB.query(
                            "UPDATE Otp SET State = TRUE WHERE OtpID = ?",
                            [otp_id],
                            (err) => { if (err) console.error("Lỗi mark OTP đã sử dụng:", err); }
                        );

                        const email = record.Email;

                        // Get User from AccountDB
                        accountDB.query(
                            "SELECT UserID, Fullname, AvailableBalance, Email FROM Users WHERE Email = ?",
                            [email],
                            (err, users) => {
                                if (err || users.length === 0) return res.status(404).json({ message: "Không tìm thấy tài khoản" });

                                const user = users[0];

                                // Get Fee from FeeDB
                                feeDB.query(
                                    "SELECT Fee FROM Fee WHERE StudentID = ?",
                                    [mssv],
                                    (err2, fees) => {
                                        if (err2 || fees.length === 0) return res.status(404).json({ message: "Không tìm thấy học phí sinh viên" });

                                        const feeAmount = Number(fees[0].Fee);
                                        const balance = Number(user.AvailableBalance);

                                        if (balance < feeAmount) return res.status(400).json({ message: "Số dư không đủ để thanh toán" });

                                        const newBalance = balance - feeAmount;

                                        // Insert transaction
                                        accountDB.query(
                                            "INSERT INTO TransactionInfo (TransactionID, UserID, TransactionDate, StudentID, Amount, State) VALUES (?, ?, Now(), ?, ?, True)",
                                            [paymentId, user.UserID, mssv, feeAmount],
                                            (errTr, resultTr) => {
                                                if (errTr) return res.status(500).json({ message: "Tạo giao dịch thất bại" });

                                                const transactionId = resultTr.insertId;

                                                // Update fee
                                                feeDB.query(
                                                    "UPDATE Fee SET Fee = 0, State = 1 WHERE StudentID = ?",
                                                    [mssv],
                                                    (errFee) => {
                                                        if (errFee) return res.status(500).json({ message: "Cập nhật học phí thất bại" });

                                                        // Update balance
                                                        accountDB.query(
                                                            "UPDATE Users SET AvailableBalance = ? WHERE UserID = ?",
                                                            [newBalance, user.UserID],
                                                            (errAcc) => {
                                                                if (errAcc) return res.status(500).json({ message: "Cập nhật số dư thất bại" });

                                                                // Update IdempotencyKey with transaction ID
                                                                otpDB.query(
                                                                    "UPDATE IdempotencyKey SET LastUsedTx = ? WHERE KeyUUID = ?",
                                                                    [transactionId.toString(), idempotencyKey],
                                                                    (errKeyUpdate) => {
                                                                        if (errKeyUpdate) console.error("Lỗi cập nhật IdempotencyKey:", errKeyUpdate);
                                                                    }
                                                                );

                                                                // Send receipt email
                                                                const template = fs.readFileSync(path.join(__dirname, "views", "receiptEmail.html"), "utf8");
                                                                const htmlReceipt = template
                                                                    .replace("{{FULLNAME}}", user.Fullname)
                                                                    .replace("{{MSSV}}", mssv)
                                                                    .replace("{{AMOUNT}}", feeAmount.toLocaleString("vi-VN"))
                                                                    .replace("{{TRANSACTION_ID}}", transactionId)
                                                                    .replace("{{DATE}}", new Date().toLocaleString("vi-VN"));

                                                                const transporter = nodemailer.createTransport({
                                                                    service: "gmail",
                                                                    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
                                                                });

                                                                transporter.sendMail({
                                                                    from: process.env.EMAIL_USER,
                                                                    to: user.Email,
                                                                    subject: "Biên lai thanh toán học phí",
                                                                    html: htmlReceipt,
                                                                }).catch(err => console.error("Lỗi gửi email biên lai:", err));

                                                                return res.json({
                                                                    message: "Thanh toán thành công",
                                                                    amount: feeAmount,
                                                                    newBalance,
                                                                    transactionId
                                                                });
                                                            }
                                                        );
                                                    }
                                                );
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    })
});

// get transactions
app.get("/api/transactions/:userId", (req, res) => {
    const userId = req.params.userId;

    accountDB.query("SELECT * FROM TransactionInfo WHERE UserID = ? ORDER BY TransactionDate DESC", [userId], (err, results) => {
        if (err) return res.status(500).json({ message: "Lỗi truy vấn giao dịch" });
        res.json(results);
    });
});

// get balance
app.get("/api/balance/:userId", (req, res) => {
    const userId = req.params.userId;

    accountDB.query("SELECT AvailableBalance FROM Users WHERE UserID = ?", [userId], (err, results) => {
        if (err) return res.status(500).json({ message: "Lỗi truy vấn số dư" });
        if (results.length === 0) return res.status(404).json({ message: "Không tìm thấy người dùng" });
        res.json({ availableBalance: results[0].AvailableBalance });
    });
});

// port
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server chạy tại http://localhost:${port}`);
});
