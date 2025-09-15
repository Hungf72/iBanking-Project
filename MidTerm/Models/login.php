<?php
    session_start();

    $servername = "localhost";  
    $username   = "root";    
    $password   = "";
    $dbname     = "FeeDatabase";

    $con = new mysqli($servername, $username, $password, $dbname);

    if ($con->connect_error) {
        die("Connection Failed: " . $con->connect_error);
    }

    if($_SERVER["REQUEST_METHOD"] == "POST"){
        $username = trim($_POST['uname'] ?? '');
        $password = $_POST['password'] ?? '';

        if (empty($username) || empty($password)) {
            echo "Username and password are required.";
        } else {
            $stmt = $con->prepare("SELECT UserID, Username, Pwd FROM Account WHERE Username = ?");
            $stmt->bind_param("s", $username);
            $stmt->execute();
            $result = $stmt->get_result();

            if ($result->num_rows > 0){
                $row = $result->fetch_assoc();

                if ($password === $row['Pwd']){
                    $_SESSION['userid'] = $row['UserID'];
                    $_SESSION['username'] = $row['Username'];

                    $user_stmt = $con->prepare("SELECT Fullname, AvailableBalance FROM Users WHERE UserID = ?");
                    $user_stmt->bind_param("s", $row['UserID']);
                    $user_stmt->execute();
                    $user_result = $user_stmt->get_result();

                    if ($user_result->num_rows > 0) {
                        $user_data = $user_result->fetch_assoc();
                        $_SESSION['fullname'] = $user_data['Fullname'];
                        $_SESSION['balance'] = $user_data['AvailableBalance'];
                    }
                    $user_stmt->close();

                    echo "Login successful. Welcome, " . htmlspecialchars($username) . "!";
                    exit();
                } else {
                    echo "Invalid password.";
                }
            }
            else {
                echo "No user found with that username.";
            }
            $stmt->close();
        }
    }
    $con->close();
?>