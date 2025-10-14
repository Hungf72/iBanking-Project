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
                        token: "fake-jwt-token"
                    });
                });
            } 
            else {
                return res.status(401).json({ message: "Invalid password" });
            }
        } 
        else {
            return res.status(404).json({ message: "No user found with that username" });
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
    if (!mssv) return res.status(400).json({ message: "Thiếu MSSV" });

    accountDB.query("SELECT Email FROM Users WHERE UserID = ?", [req.session.userid], (err, results) => {
        if (err) return res.status(500).json({ message: "Internal server error" });
        if (results.length === 0) return res.status(404).json({ message: "Không tìm thấy email" });

        const userEmail = results[0].Email;

        // Xóa OTP hết hạn hoặc đã mark
        otpDB.query(
            "DELETE FROM Otp WHERE Email = ? AND (ExpiredAt <= NOW() OR State = TRUE)",
            [userEmail],
            (err) => { if (err) console.error("Lỗi xóa OTP hết hạn:", err); }
        );

        // Kiểm tra OTP chưa hết hạn
        otpDB.query("SELECT * FROM Otp WHERE Email = ? AND ExpiredAt > NOW() AND State = FALSE",[userEmail],(err, existingOtp) => {
                if (err) return res.status(500).json({ message: "Internal server error" });

                let otp, otp_id, payment_id, expiredAt, impedanceKey;

                if (existingOtp.length > 0) {
                    otp = existingOtp[0].OtpCode;
                    otp_id = existingOtp[0].OtpID;
                    payment_id = randomInt(100000, 1000000).toString();
                    impedanceKey = existingOtp.ImpedanceKey;
                    expiredAt = existingOtp[0].ExpiredAt;
                } 
                else {
                    otp = Math.floor(100000 + Math.random() * 900000).toString();
                    otp_id = randomInt(100000, 1000000).toString();
                    payment_id = randomInt(100000, 1000000).toString();
                    expiredAt = new Date(Date.now() + 60 * 1000);
                    impedanceKey = randomUUID();

                    otpDB.query(
                        "INSERT INTO Otp (OtpID, ImpedanceKey, Email, OtpCode, ExpiredAt) VALUES (?, ?, ?, ?)",
                        [otp_id, impedanceKey, userEmail, otp, expiredAt],
                        (err2) => { if (err2) console.error("Lỗi lưu OTP:", err2); }
                    );

                    // Tự động mark State = TRUE sau 60s
                    const delay = expiredAt.getTime() - Date.now();
                    setTimeout(() => {
                        otpDB.query(
                            "UPDATE Otp SET State = TRUE WHERE OtpID = ?",
                            [otp_id],
                            (err3) => { if (err3) console.error("Lỗi mark OTP hết hạn:", err3); }
                        );
                    }, delay);
                }

                // Gửi email OTP
                const template = fs.readFileSync(path.join(__dirname, "views", "otpEmail.html"), "utf8");
                const htmlContent = template.replace("{{OTP_CODE}}", otp);

                const transporter = nodemailer.createTransport({
                    service: "gmail",
                    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
                });

                transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: userEmail,
                    subject: "Mã OTP thanh toán học phí",
                    html: htmlContent,
                }).catch(err => console.error("Lỗi gửi email:", err));

                res.json({
                    payment_id,
                    otp_id,
                    expiredAt,
                    impedanceKey,
                    message: `Nhập mã OTP (6 chữ số) vừa được gửi ${userEmail}.`
                });
            }
        );
    });
});

// confirm otp
app.post("/api/payments/:paymentId/confirm", (req, res) => {
    const paymentId = req.params.paymentId;
    const { otp, mssv, impedanceKey } = req.body;
    const otp_id = req.query.otp_id;

    if (!otp_id || !otp || !mssv) {
        return res.status(400).json({ message: "Thiếu otp hoặc otp_id hoặc mssv" });
    }

    // Kiểm tra OTP còn hiệu lực
    otpDB.query("SELECT * FROM Otp WHERE OtpID = ? AND ImpedanceKey = ? AND State = FALSE AND ExpiredAt > NOW()",[otp_id, impedanceKey],(err, results) => {
        if (err) return res.status(500).json({ message: "Internal server error" });
        if (results.length === 0) return res.status(400).json({ message: "OTP không hợp lệ hoặc đã hết hạn" });

        const record = results[0];
        if (record.OtpCode !== otp) return res.status(400).json({ message: "OTP không đúng" });

        // delete OTP đã sử dụng
        otpDB.query("Delete From Otp WHERE OtpID = ?",[otp_id],(err) => {
            if (err) console.error("Lỗi delete OTP đã sử dụng:", err);
        });

        const email = record.Email;

        // Lấy User từ AccountDB
        accountDB.query("SELECT UserID, Fullname, AvailableBalance, Email FROM Users WHERE Email = ?",[email],(err, users) => {
            if (err || users.length === 0) return res.status(404).json({ message: "Không tìm thấy tài khoản" });

            const user = users[0];

            // Lấy Fee từ FeeDB
            feeDB.query("SELECT Fee FROM Fee WHERE StudentID = ?",[mssv],(err2, fees) => {
                if (err2 || fees.length === 0) return res.status(404).json({ message: "Không tìm thấy học phí sinh viên" });

                const feeAmount = Number(fees[0].Fee);
                const balance = Number(user.AvailableBalance);

                if (balance < feeAmount) return res.status(400).json({ message: "Số dư không đủ để thanh toán" });

                const newBalance = balance - feeAmount;

                // insert transaction
                accountDB.query("INSERT INTO TransactionInfo (TransactionID, UserID, TransactionDate, StudentID, Amount, State) VALUES (?, ?, Now(), ?, ?, True)",[paymentId ,user.UserID, mssv, feeAmount],(errTr, resultTr) => {
                    if (errTr) return res.status(500).json({ message: "Tạo giao dịch thất bại" });

                    const transactionId = resultTr.insertId;
                    // update fee
                    feeDB.query("UPDATE Fee SET Fee = 0 WHERE StudentID = ?",[mssv],(errFee) => {
                        if (errFee) return res.status(500).json({ message: "Cập nhật học phí thất bại" });

                        // update balance
                        accountDB.query("UPDATE Users SET AvailableBalance = ? WHERE UserID = ?",[newBalance, user.UserID],(errAcc) => {
                            if (errAcc) return res.status(500).json({ message: "Cập nhật số dư thất bại" });

                            // commit transaction
                            accountDB.commit(errCommit => {
                                if (errCommit) return res.status(500).json({ message: "Commit thất bại" });
                                // Gửi email biên lai
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
                                });
                                return res.json({
                                    message: "Thanh toán thành công",
                                    amount: feeAmount,
                                    newBalance,
                                    transactionId
                                });

                            });
                        });
                    });
                });
            });
        });
    });
});

// get transactions
app.get("/api/transactions/:userId", (req, res) => {
    const userId = req.params.userId;

    accountDB.query("SELECT * FROM TransactionInfo WHERE UserID = ? ORDER BY TransactionDate DESC",[userId],(err, results) => {
        if (err) return res.status(500).json({ message: "Lỗi truy vấn giao dịch" });
        res.json(results);
    });
});

// get balance
app.get("/api/balance/:userId", (req, res) => {
    const userId = req.params.userId;

    accountDB.query("SELECT AvailableBalance FROM Users WHERE UserID = ?",[userId],(err, results) => {
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
