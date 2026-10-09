import mongoose from "mongoose";

export const connectDB = async () => {
    try {
        const mongoUrl = process.env.MONGO_URL;
        if (!mongoUrl) {
            throw new Error("MONGO_URL is not set in the environment");
        }

        const serverSelectionTimeoutMS = Number(
            process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS ?? 30000
        );
        const connectTimeoutMS = Number(
            process.env.MONGO_CONNECT_TIMEOUT_MS ?? 30000
        );

        console.log("Connecting to Database...");
        const conn = await mongoose.connect(mongoUrl, {
            dbName: "project-management-system",
            serverSelectionTimeoutMS,
            connectTimeoutMS,
        });
        console.log(`Connected to Database: ${conn.connection.host}`);
    } catch (err) {
        console.log("Database Connection Failed", err);
        process.exit(1);
    }
};
