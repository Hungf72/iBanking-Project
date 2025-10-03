CREATE DATABASE AccountDB;
USE AccountDB;

-- Bảng Account
CREATE TABLE Account (
    UserID VARCHAR(100) PRIMARY KEY,
    Username VARCHAR(50),
    Pwd VARCHAR(100)
);

-- Bảng Users
CREATE TABLE Users (
    UserID VARCHAR(100),
    Fullname VARCHAR(50),
    PhoneNum VARCHAR(10) UNIQUE,
    Email VARCHAR(50) UNIQUE,
    AvailableBalance DECIMAL(15,2) CHECK (AvailableBalance >= 0.0),
    
    CONSTRAINT ck_PhoneNum CHECK (CHAR_LENGTH(PhoneNum) = 10),
    CONSTRAINT fk_UserID FOREIGN KEY (UserID) REFERENCES Account(UserID)
);

-- Bản thông tin giao dịch
CREATE TABLE TransactionInfo (
    TransactionID INT AUTO_INCREMENT PRIMARY KEY,
    UserID VARCHAR(100),
    TransactionDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    StudentID VARCHAR(50),
    Amount DECIMAL(15,2) CHECK (Amount >= 0.0),
    State BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_Transaction_UserID FOREIGN KEY (UserID) REFERENCES Account(UserID)
);

DELIMITER $$
CREATE TRIGGER autoUSI
BEFORE INSERT ON Account
FOR EACH ROW
BEGIN
    DECLARE nextID INT;

    SELECT IFNULL(MAX(CAST(SUBSTRING(UserID, 2) AS UNSIGNED)), 0) + 1
    INTO nextID
    FROM Account;

    SET NEW.UserID = CONCAT('U', LPAD(nextID, 4, '0'));
END$$
DELIMITER ;

insert into Account (Username, Pwd) values ('kylehuynh', '12345');

insert into Users (UserID, Fullname, PhoneNum, Email, AvailableBalance) values 
('U0001', 'Kyle Huynh', '1234567890', 'huygia9105@gmail.com', 100000000.00);
