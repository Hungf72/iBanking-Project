CREATE DATABASE FeeDB;
USE FeeDB;

-- Bảng Fee
CREATE TABLE Fee (
    StudentID VARCHAR(50) PRIMARY KEY,
    StudentFullname VARCHAR(100),
    Fee DECIMAL(15,2) CHECK (Fee >= 0.0),
    State boolean DEFAULT FALSE
);

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

insert into Fee(StudentID, StudentFullname, Fee) values
('S001', 'Vo Anh Kiet', 30000000),





