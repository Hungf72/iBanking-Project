const express = require("express");
const session = require("express-session");
const path = require("path");
require("dotenv").config(); 
const bodyParser = require("body-parser");
const mysql = require("mysql2");

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// connection
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

// Session
app.use(
    session({
        secret: "secret-key", 
        resave: false,
        saveUninitialized: true,
    })
);

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
                console.log(`User ${user.Username} logged in successfully.`);

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
    const mssv = req.query.mssv;
    const sql = "select * from Fee where StudentID = ?";

    feeDB.query(sql, [mssv], (err, results) => {
        if (err) {
            console.error("MySQL error:", err);
            return res.status(500).json({ message: "Internal server error." });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy sinh viên" });
        }

        const row = results[0];
        res.json({
            student: {
                mssv: row.StudentID,
                full_name: row.StudentFullname
            },
            invoice: {
                amount_due: row.Fee,
                amount_paid: row.Fee === 0 ? row.Fee : 0,
                status: row.State ? "Đã đóng" : "Nợ học phí"
            }
        });
    });
});


// port
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server chạy tại http://localhost:${port}`);
});
