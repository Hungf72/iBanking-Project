const express = require("express");
const session = require("express-session");
const path = require("path");
require("dotenv").config(); 
const bodyParser = require("body-parser");
const mysql = require("mysql2");

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
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

// Route login (POST)
app.post("/login", (req, res) => {
    const username = req.body.username?.trim();
    const password = req.body.password;

    if (!username || !password) {
        return res.status(401).send("Username and password are required.");
    }

    const sql = "SELECT UserID, Username, Pwd FROM Account WHERE Username = ?";
    accountDB.query(sql, [username], (err, results) => {  
        if (err) {
            console.error(err);
            return res.status(500).send("Internal server error.");
        }

        if (results.length > 0) {
            const user = results[0];

            if (password === user.Pwd) {
                req.session.userid = user.UserID;
                req.session.username = user.Username;

                return res.redirect("/home");
            } 
            else {
                return res.status(401).send("Invalid password.");
            }
        }
        else {
            return res.send("No user found with that username.");
        }
    });
});

// login page
app.get("/", (req, res) => {
    res.redirect("/login");
});

app.get("/login", (req, res) => {
    res.render("login", { error: null });
});

// port
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server chạy tại http://localhost:${port}`);
});
