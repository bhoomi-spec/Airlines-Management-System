-- Create database
CREATE DATABASE IF NOT EXISTS airlines_db;
USE airlines_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    password VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    address TEXT NOT NULL,
    role ENUM('passenger', 'staff', 'admin') NOT NULL DEFAULT 'passenger',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Airports table
CREATE TABLE IF NOT EXISTS airports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10) NOT NULL UNIQUE,
    city VARCHAR(50) NOT NULL,
    country VARCHAR(50) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8)
);

-- Aircraft table
CREATE TABLE IF NOT EXISTS aircraft (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    model VARCHAR(50) NOT NULL,
    manufacturer VARCHAR(50) NOT NULL,
    capacity INT NOT NULL,
    year_manufactured YEAR,
    status ENUM('active', 'maintenance', 'retired') NOT NULL DEFAULT 'active'
);

-- Flights table
CREATE TABLE IF NOT EXISTS flights (
    id INT AUTO_INCREMENT PRIMARY KEY,
    flight_number VARCHAR(20) NOT NULL,
    departure_airport_id INT NOT NULL,
    arrival_airport_id INT NOT NULL,
    departure_time DATETIME NOT NULL,
    arrival_time DATETIME NOT NULL,
    aircraft_id INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    class ENUM('economy', 'business', 'first') NOT NULL DEFAULT 'economy',
    total_seats INT NOT NULL,
    available_seats INT NOT NULL,
    status ENUM('scheduled', 'delayed', 'cancelled', 'completed') NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (departure_airport_id) REFERENCES airports(id),
    FOREIGN KEY (arrival_airport_id) REFERENCES airports(id),
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id)
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    flight_id INT NOT NULL,
    booking_date DATETIME NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'pending',
    total_passengers INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (flight_id) REFERENCES flights(id)
);

-- Passengers table
CREATE TABLE IF NOT EXISTS passengers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    date_of_birth DATE NOT NULL,
    passport_number VARCHAR(50),
    seat_number VARCHAR(10),
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- Staff table
CREATE TABLE IF NOT EXISTS staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    staff_id VARCHAR(20) NOT NULL UNIQUE,
    position VARCHAR(50) NOT NULL,
    department VARCHAR(50) NOT NULL,
    hire_date DATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Sample data for airports
INSERT INTO airports (name, code, city, country, latitude, longitude) VALUES
('John F. Kennedy International Airport', 'JFK', 'New York', 'United States', 40.6413, -73.7781),
('Los Angeles International Airport', 'LAX', 'Los Angeles', 'United States', 33.9416, -118.4085),
('Heathrow Airport', 'LHR', 'London', 'United Kingdom', 51.4700, -0.4543),
('Charles de Gaulle Airport', 'CDG', 'Paris', 'France', 49.0097, 2.5479),
('Tokyo Haneda Airport', 'HND', 'Tokyo', 'Japan', 35.5494, 139.7798),
('Dubai International Airport', 'DXB', 'Dubai', 'United Arab Emirates', 25.2532, 55.3657),
('Singapore Changi Airport', 'SIN', 'Singapore', 'Singapore', 1.3644, 103.9915),
('Sydney Airport', 'SYD', 'Sydney', 'Australia', -33.9399, 151.1753);

-- Sample data for aircraft
INSERT INTO aircraft (name, model, manufacturer, capacity, year_manufactured, status) VALUES
('Boeing 737-800', '737-800', 'Boeing', 189, 2010, 'active'),
('Airbus A320', 'A320', 'Airbus', 180, 2015, 'active'),
('Boeing 787 Dreamliner', '787-9', 'Boeing', 290, 2018, 'active'),
('Airbus A350', 'A350-900', 'Airbus', 325, 2019, 'active'),
('Boeing 777', '777-300ER', 'Boeing', 396, 2014, 'active');

-- Sample admin user (password: admin123)
INSERT INTO users (first_name, last_name, email, phone, password, date_of_birth, address, role) VALUES
('Admin', 'User', 'admin@skywayairlines.com', '123-456-7890', '$2b$10$5QvfmT3uQnJqDxmQE5A7.OINvbp1BZbT3q5YTkhPW6Qh6oG3Uw1Hy', '1980-01-01', '123 Admin Street, Admin City', 'admin');
