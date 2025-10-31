CREATE DATABASE FeeDB;
USE FeeDB;

-- Bảng Fee
CREATE TABLE Fee (
    PaymentID CHAR(6) PRIMARY KEY,             
    StudentID VARCHAR(50) UNIQUE,           
    StudentFullname VARCHAR(100),
    Fee DECIMAL(15,2) CHECK (Fee >= 0.0),
    State BOOLEAN DEFAULT FALSE
);

DELIMITER $$

CREATE TRIGGER trg_fee_before_insert
BEFORE INSERT ON Fee
FOR EACH ROW
BEGIN
    DECLARE newId CHAR(6);
    DECLARE existsId INT DEFAULT 1;

    -- Sinh PaymentID mới cho đến khi không trùng
    WHILE existsId > 0 DO
        SET newId = LPAD(FLOOR(RAND() * 1000000), 6, '0'); -- 6 chữ số
        SELECT COUNT(*) INTO existsId FROM Fee WHERE PaymentID = newId;
    END WHILE;

    SET NEW.PaymentID = newId;

    -- Gán trạng thái tự động
    IF NEW.Fee = 0 THEN
        SET NEW.State = TRUE;
    ELSE
        SET NEW.State = FALSE;
    END IF;
END$$

DELIMITER ;


INSERT INTO Fee (StudentID, StudentFullname, Fee)
VALUES
('S001', 'Vo Anh Kiet', 30000000),
('S002', 'Nguyen Quoc Hung', 35000000),
('S003', 'Le Hoang Minh', 27000000),
('S004', 'Nguyen Ngoc Tu', 25000000),
('S005', 'Huynh Gia Huy', 20000000);

SELECT * FROM Fee;
