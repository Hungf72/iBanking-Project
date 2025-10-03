create database IBankingDB;
use IBankingDB;

-- Bảng Account
CREATE TABLE Account (
    UserID VARCHAR(100) PRIMARY KEY,
    Username VARCHAR(50),
    Pwd VARCHAR(100)
);

-- Bảng Users
CREATE TABLE Users (
    UserID VARCHAR(100) PRIMARY KEY,
    Fullname VARCHAR(50),
    PhoneNum VARCHAR(10) UNIQUE,
    Email VARCHAR(50) UNIQUE,
    AvailableBalance DECIMAL(15,2) CHECK (AvailableBalance >= 0.0),
    
    CONSTRAINT ck_PhoneNum CHECK (CHAR_LENGTH(PhoneNum) = 10),
    CONSTRAINT fk_UserID FOREIGN KEY (UserID) REFERENCES Account(UserID)
);

-- Bảng Fee
CREATE TABLE Fee (
    StudentID VARCHAR(50) PRIMARY KEY,
    StudentFullname VARCHAR(100),
    Fee DECIMAL(15,2) CHECK (Fee >= 0.0),
    State boolean DEFAULT FALSE
);

-- Bảng thông tin giao dịch
CREATE TABLE TransactionInfo (
    TransactionID INT AUTO_INCREMENT PRIMARY KEY,
    UserID VARCHAR(100),
    StudentFullname VARCHAR(100),
    TransactionDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    State BOOLEAN DEFAULT FALSE,
    Amount DECIMAL(15,2) CHECK (Amount >= 0.0),

    Foreign key (StudentFullname) REFERENCES Fee(StudentFullname)
    Foreign key (UserID) REFERENCES Users(UserID)
);

-- trigger auto UserID
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

-- trigger auto State
DELIMITER $$
CREATE TRIGGER trg_fee_state_insert
BEFORE INSERT ON Fee
FOR EACH ROW
BEGIN
    IF NEW.Fee = 0 THEN
        SET NEW.State = TRUE;
    ELSE
        SET NEW.State = FALSE;
    END IF;
END$$

CREATE TRIGGER trg_fee_state_update
BEFORE UPDATE ON Fee
FOR EACH ROW
BEGIN
    IF NEW.Fee = 0 THEN
        SET NEW.State = TRUE;
    ELSE
        SET NEW.State = FALSE;
    END IF;
END$$
DELIMITER ;

-- insert data
insert into Account (Username, Pwd) values ('kylehuynh', '12345');

insert into Users (UserID, Fullname, PhoneNum, Email, AvailableBalance) values 
('U0001', 'Kyle Huynh', '1234567890', 'kylehuynh@gmail.com', 100000000.00);

insert into Fee(StudentID, StudentFullname, Fee) values
('S001', 'Vo Anh Kiet', 30000000),