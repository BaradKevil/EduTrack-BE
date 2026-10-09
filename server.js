import { connectDB } from "./config/db.js";
import app from "./app.js";
import dotenv from "dotenv";

dotenv.config();

// DATABASE CONNECTION & START SERVER
const PORT = process.env.PORT || 4000;
let server;

const startServer = async () => {
    await connectDB();
    server = app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
};

startServer();



//ERROR HANDLING
process.on("unhandledRejection", (err) => {
    console.error(`Unhandled Rejection: ${err.message}`);
    server.close(() => process.exit(1));
    
});

process.on("uncaughtException", (err) => {
    console.error(`Uncaught Exception: ${err.message}`);
    process.exit(1);
    
}); 


export default server;