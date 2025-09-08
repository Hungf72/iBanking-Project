use master
go 
if exists(select 1 from sysdatabases where name = 'FeeDatabase')
    drop database FeeDatabase;
go

-- database
create database FeeDatabase
go 
use FeeDatabase
go

-- table
create table Account(
    UserID varchar(100) PRIMARY KEY,
    Username varchar(50),
    Pwd nvarchar(100)
)
go 
create table Users(
    UserID varchar(100) PRIMARY KEY,
    Fullname varchar(50),
    PhoneNum varchar(10) unique,
    Email varchar(50) unique,
    AvailableBalance float check(AvailableBalance >= 0.0),

    constraint ck_PhoneNum check(len(PhoneNum) = 10),
    constraint fk_UserID FOREIGN KEY(UserID) REFERENCES Account(UserID)
)
go
create table TransactionInfo(
    Id int IDENTITY PRIMARY KEY,
    UserID varchar(100),
    TransactionAmount float check(TransactionAmount >= 0.0),
    TransactionDate datetime DEFAULT getDate(),
    Note nvarchar(255),

    constraint fk_UserID_Trans FOREIGN KEY(UserID) REFERENCES Account(UserID)
)
go 
create table Tution(
    StudentID varchar(50) PRIMARY KEY,
    StudentFullname nvarchar(100),
    Fee float check(Fee >= 0.0)
)
go 

create table OTP(
    OTPID int IDENTITY PRIMARY KEY,
    UserID varchar(100),
    OTPCode varchar(6) NOT NULL,
    CreateTime datetime DEFAULT getDate(),
    ExpirationTime datetime NOT NULL,
    IsUsed bit DEFAULT 0,

    constraint fk_OTP_User FOREIGN KEY(UserID) REFERENCES Account(UserID)
)
go

-- proce SearchStudent
create procedure SearchStudent @SID varchar(50)
as 
begin 
    Select * from Tution where StudentID = @SID 
end 
go 

-- insert
insert into Tution values('523H0032',N'Huynh Gia Huy', 23000500)

exec SearchStudent @SID = '523H0032'