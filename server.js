// Import required modules
import express from "express"
import mysql from "mysql2/promise"
import cors from "cors"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

// Create Express app
const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static("public"))

// Database connection
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "airlines_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection()
    console.log("Database connection successful")
    connection.release()
  } catch (error) {
    console.error("Database connection failed:", error)
  }
}

testConnection()

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret"

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) return res.status(401).json({ message: "Access denied" })

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" })
    req.user = user
    next()
  })
}

// Routes

// User Registration
app.post("/api/register", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, dob, address } = req.body

    // Check if user already exists
    const [existingUsers] = await pool.query("SELECT * FROM users WHERE email = ?", [email])

    if (existingUsers.length > 0) {
      return res.status(400).json({ message: "User already exists with this email" })
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Insert user
    const [result] = await pool.query(
      "INSERT INTO users (first_name, last_name, email, phone, password, date_of_birth, address, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [firstName, lastName, email, phone, hashedPassword, dob, address, "passenger"],
    )

    if (result.affectedRows > 0) {
      res.status(201).json({ message: "User registered successfully" })
    } else {
      res.status(500).json({ message: "Failed to register user" })
    }
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// User Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password, role } = req.body

    // Get user from database
    const [users] = await pool.query("SELECT * FROM users WHERE email = ? AND role = ?", [email, role || "passenger"])

    if (users.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" })
    }

    const user = users[0]

    // Check password
    const validPassword = await bcrypt.compare(password, user.password)

    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" })
    }

    // Create and assign token
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "1h" })

    res.status(200).json({
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Get Flights
app.get("/api/flights", async (req, res) => {
  try {
    const { departure, destination, departureDate, returnDate, passengers, class: flightClass } = req.query

    let query = `
            SELECT f.*, a1.name as departure_airport, a1.city as departure_city, a1.country as departure_country,
            a2.name as arrival_airport, a2.city as arrival_city, a2.country as arrival_country,
            ac.name as aircraft_name, ac.model as aircraft_model
            FROM flights f
            JOIN airports a1 ON f.departure_airport_id = a1.id
            JOIN airports a2 ON f.arrival_airport_id = a2.id
            JOIN aircraft ac ON f.aircraft_id = ac.id
            WHERE 1=1
        `

    const queryParams = []

    if (departure) {
      query += " AND a1.city LIKE ?"
      queryParams.push(`%${departure}%`)
    }

    if (destination) {
      query += " AND a2.city LIKE ?"
      queryParams.push(`%${destination}%`)
    }

    if (departureDate) {
      query += " AND DATE(f.departure_time) = ?"
      queryParams.push(departureDate)
    }

    if (flightClass) {
      query += " AND f.class = ?"
      queryParams.push(flightClass)
    }

    const [flights] = await pool.query(query, queryParams)

    res.status(200).json(flights)
  } catch (error) {
    console.error("Get flights error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Book Flight
app.post("/api/bookings", authenticateToken, async (req, res) => {
  try {
    const { flightId, passengers } = req.body
    const userId = req.user.id

    // Start transaction
    const connection = await pool.getConnection()
    await connection.beginTransaction()

    try {
      // Check if flight exists and has available seats
      const [flights] = await connection.query("SELECT * FROM flights WHERE id = ? AND available_seats >= ?", [
        flightId,
        passengers.length,
      ])

      if (flights.length === 0) {
        await connection.rollback()
        connection.release()
        return res.status(400).json({ message: "Flight not available or insufficient seats" })
      }

      // Create booking
      const [bookingResult] = await connection.query(
        "INSERT INTO bookings (user_id, flight_id, booking_date, status, total_passengers) VALUES (?, ?, NOW(), ?, ?)",
        [userId, flightId, "confirmed", passengers.length],
      )

      const bookingId = bookingResult.insertId

      // Add passengers
      for (const passenger of passengers) {
        await connection.query(
          "INSERT INTO passengers (booking_id, first_name, last_name, date_of_birth, passport_number, seat_number) VALUES (?, ?, ?, ?, ?, ?)",
          [
            bookingId,
            passenger.firstName,
            passenger.lastName,
            passenger.dob,
            passenger.passportNumber,
            passenger.seatNumber,
          ],
        )
      }

      // Update available seats
      await connection.query("UPDATE flights SET available_seats = available_seats - ? WHERE id = ?", [
        passengers.length,
        flightId,
      ])

      // Commit transaction
      await connection.commit()
      connection.release()

      res.status(201).json({ message: "Booking successful", bookingId })
    } catch (error) {
      await connection.rollback()
      connection.release()
      throw error
    }
  } catch (error) {
    console.error("Booking error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Get User Bookings
app.get("/api/bookings", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const [bookings] = await pool.query(
      `
            SELECT b.*, f.flight_number, f.departure_time, f.arrival_time, 
            a1.city as departure_city, a2.city as arrival_city
            FROM bookings b
            JOIN flights f ON b.flight_id = f.id
            JOIN airports a1 ON f.departure_airport_id = a1.id
            JOIN airports a2 ON f.arrival_airport_id = a2.id
            WHERE b.user_id = ?
            ORDER BY b.booking_date DESC
        `,
      [userId],
    )

    // Get passengers for each booking
    for (const booking of bookings) {
      const [passengers] = await pool.query("SELECT * FROM passengers WHERE booking_id = ?", [booking.id])
      booking.passengers = passengers
    }

    res.status(200).json(bookings)
  } catch (error) {
    console.error("Get bookings error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Admin Routes

// Get All Flights (Admin)
app.get("/api/admin/flights", authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" })
    }

    const [flights] = await pool.query(`
            SELECT f.*, a1.name as departure_airport, a1.city as departure_city,
            a2.name as arrival_airport, a2.city as arrival_city,
            ac.name as aircraft_name, ac.model as aircraft_model
            FROM flights f
            JOIN airports a1 ON f.departure_airport_id = a1.id
            JOIN airports a2 ON f.arrival_airport_id = a2.id
            JOIN aircraft ac ON f.aircraft_id = ac.id
            ORDER BY f.departure_time
        `)

    res.status(200).json(flights)
  } catch (error) {
    console.error("Admin get flights error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Add Flight (Admin)
app.post("/api/admin/flights", authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" })
    }

    const {
      flightNumber,
      departureAirportId,
      arrivalAirportId,
      departureTime,
      arrivalTime,
      aircraftId,
      price,
      flightClass,
      totalSeats,
    } = req.body

    const [result] = await pool.query(
      `INSERT INTO flights (
                flight_number, departure_airport_id, arrival_airport_id, 
                departure_time, arrival_time, aircraft_id, price, 
                class, total_seats, available_seats, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        flightNumber,
        departureAirportId,
        arrivalAirportId,
        departureTime,
        arrivalTime,
        aircraftId,
        price,
        flightClass,
        totalSeats,
        totalSeats,
        "scheduled",
      ],
    )

    if (result.affectedRows > 0) {
      res.status(201).json({ message: "Flight added successfully", flightId: result.insertId })
    } else {
      res.status(500).json({ message: "Failed to add flight" })
    }
  } catch (error) {
    console.error("Admin add flight error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Get All Bookings (Admin)
app.get("/api/admin/bookings", authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" })
    }

    const [bookings] = await pool.query(`
            SELECT b.*, u.first_name, u.last_name, u.email,
            f.flight_number, f.departure_time, f.arrival_time,
            a1.city as departure_city, a2.city as arrival_city
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN flights f ON b.flight_id = f.id
            JOIN airports a1 ON f.departure_airport_id = a1.id
            JOIN airports a2 ON f.arrival_airport_id = a2.id
            ORDER BY b.booking_date DESC
        `)

    res.status(200).json(bookings)
  } catch (error) {
    console.error("Admin get bookings error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Get Dashboard Stats (Admin)
app.get("/api/admin/stats", authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" })
    }

    // Get total flights
    const [flightsResult] = await pool.query("SELECT COUNT(*) as total FROM flights")
    const totalFlights = flightsResult[0].total

    // Get total passengers
    const [passengersResult] = await pool.query("SELECT COUNT(*) as total FROM passengers")
    const totalPassengers = passengersResult[0].total

    // Get total bookings
    const [bookingsResult] = await pool.query("SELECT COUNT(*) as total FROM bookings")
    const totalBookings = bookingsResult[0].total

    // Get total revenue
    const [revenueResult] = await pool.query(`
            SELECT SUM(f.price * b.total_passengers) as total
            FROM bookings b
            JOIN flights f ON b.flight_id = f.id
        `)
    const totalRevenue = revenueResult[0].total || 0

    // Get monthly bookings for the current year
    const [monthlyBookings] = await pool.query(`
            SELECT MONTH(booking_date) as month, COUNT(*) as count
            FROM bookings
            WHERE YEAR(booking_date) = YEAR(CURDATE())
            GROUP BY MONTH(booking_date)
            ORDER BY month
        `)

    // Get monthly revenue for the current year
    const [monthlyRevenue] = await pool.query(`
            SELECT MONTH(b.booking_date) as month, SUM(f.price * b.total_passengers) as revenue
            FROM bookings b
            JOIN flights f ON b.flight_id = f.id
            WHERE YEAR(b.booking_date) = YEAR(CURDATE())
            GROUP BY MONTH(b.booking_date)
            ORDER BY month
        `)

    res.status(200).json({
      totalFlights,
      totalPassengers,
      totalBookings,
      totalRevenue,
      monthlyBookings,
      monthlyRevenue,
    })
  } catch (error) {
    console.error("Admin stats error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
