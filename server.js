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
    console.log("Đã kết nối MySQL (XAMPP) thành công!");
});

// Session
app.use(
    session({
        secret: "secret-key", 
        resave: false,
        saveUninitialized: true,
    })
);

// Route login
app.post("/api/login", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }

    const sql = "SELECT UserID, Username, Pwd FROM Account WHERE Username = ?";
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
                return res.json({
                    message: "Login success",
                    user: { id: user.UserID, username: user.Username },
                    token: "fake-jwt-token"
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


// login page
app.get("/", (req, res) => {
    res.redirect("/index");
});

app.get("/index", (req, res) => {
    res.render("index", { error: null });
});

// port
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server chạy tại http://localhost:${port}`);
});
