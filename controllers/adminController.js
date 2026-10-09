import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import User from "../models/user.js";
import { Project } from "../models/project.js";
import { Panel } from "../models/panel.js";
import * as userServices from "../Services/userServices.js";
import * as panelService from "../Services/panelServices.js";
import * as notificationService from "../Services/notificationServices.js";
import * as projectService from "../Services/projectServices.js";
import XLSX from "xlsx";
import fs from "fs";

const DEPARTMENT_EXPERTISE_MAP = {
    Computer: [
        "Artificial Intelligence",
        "Machine Learning",
        "Cyber Security",
        "Web Development",
        "Database System",
        "Computer Network",
        "Operating Systems",
        "Data Science",
    ],
    // IT: [
    //     "Software Engineering",
    //     "Cloud Computing",
    //     "DevOps",
    //     "Information Security",
    //     "Web Development",
    //     "Data Analytics",
    //     "Computer Network",
    // ],
    // Mechanical: [
    //     "Thermodynamics",
    //     "Fluid Mechanics",
    //     "Heat Transfer",
    //     "Machine Design",
    //     "Manufacturing",
    //     "CAD/CAM",
    //     "Robotics",
    // ],
    // Civil: [
    //     "Structural Engineering",
    //     "Geotechnical Engineering",
    //     "Transportation Engineering",
    //     "Construction Management",
    //     "Surveying",
    //     "Environmental Engineering",
    //     "Hydraulics",
    // ],
    // Electrical: [
    //     "Power Systems",
    //     "Control Systems",
    //     "Electrical Machines",
    //     "Power Electronics",
    //     "High Voltage Engineering",
    //     "Smart Grid",
    //     "Renewable Energy",
    // ],
    // Electronics: [
    //     "Embedded Systems",
    //     "VLSI Design",
    //     "Digital Signal Processing",
    //     "Microprocessors",
    //     "Communication Systems",
    //     "IoT",
    //     "Instrumentation",
    // ],
    // Chemical: [
    //     "Process Engineering",
    //     "Reaction Engineering",
    //     "Mass Transfer",
    //     "Heat Transfer",
    //     "Process Control",
    //     "Petrochemical Engineering",
    //     "Biochemical Engineering",
    // ],
    // Production: [
    //     "Operations Management",
    //     "Quality Control",
    //     "Industrial Engineering",
    //     "Supply Chain Management",
    //     "Lean Manufacturing",
    //     "Automation",
    //     "Production Planning",
    // ],
};

const normalizeDepartment = (department) => {
    if (!department || typeof department !== "string") return "";
    return department.trim();
};

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findExistingUserByEmail = async (email) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) return null;
    const escapedEmail = escapeRegex(normalizedEmail);
    return User.findOne({ email: { $regex: new RegExp(`^${escapedEmail}$`, "i") } })
        .select("name email role");
};

const ALLOWED_BULK_EXTENSIONS = [".csv", ".xls", ".xlsx"];

const normalizeKey = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

const normalizeValue = (value) => String(value ?? "").trim();

const isValidEmail = (email) =>
    /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(String(email || "").trim());

const parseExpertise = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeValue(item)).filter(Boolean);
    }

    return String(value || "")
        .split(/[,|]/)
        .map((item) => item.trim())
        .filter(Boolean);
};

const getFieldValue = (row, aliases = []) => {
    if (!row || typeof row !== "object") return "";

    const normalizedMap = new Map();
    Object.entries(row).forEach(([key, value]) => {
        normalizedMap.set(normalizeKey(key), value);
    });

    for (const alias of aliases) {
        const found = normalizedMap.get(normalizeKey(alias));
        if (found !== undefined) {
            return normalizeValue(found);
        }
    }

    return "";
};

const parseSpreadsheetRows = (filePath) => {
    const workbook = XLSX.readFile(filePath, { raw: false, cellDates: false });
    const sheetNames = workbook.SheetNames || [];

    for (const sheetName of sheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const matrix = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
            raw: false,
            blankrows: false,
        });

        const firstNonEmptyRowIndex = matrix.findIndex((row) =>
            Array.isArray(row) && row.some((cell) => normalizeValue(cell))
        );

        if (firstNonEmptyRowIndex === -1) {
            continue;
        }

        const headers = (matrix[firstNonEmptyRowIndex] || []).map((cell) => normalizeValue(cell));
        if (!headers.some(Boolean)) {
            continue;
        }

        const dataRows = matrix
            .slice(firstNonEmptyRowIndex + 1)
            .filter((row) => Array.isArray(row) && row.some((cell) => normalizeValue(cell)));

        return dataRows.map((row) => {
            const record = {};
            headers.forEach((header, index) => {
                if (!header) return;
                record[header] = normalizeValue(row?.[index]);
            });
            return record;
        });
    }

    return [];
};

const toUserSafeObject = (userDoc) => {
    const userObj = userDoc?.toObject ? userDoc.toObject() : userDoc;
    if (!userObj) return null;
    delete userObj.password;
    return userObj;
};

const extractErrorMessage = (error) => {
    const message = String(error?.message || "");
    if (message.includes("E11000") || message.toLowerCase().includes("duplicate")) {
        return "Email already exists";
    }
    if (message.includes("Password must be at least 8 characters")) {
        return "Password must be at least 8 characters";
    }
    return message || "Validation failed";
};

const buildBulkSummaryMessage = (entity, insertedCount, failedCount) =>
    `Bulk ${entity} upload processed: ${insertedCount} added, ${failedCount} failed.`;



export const getDashboardStats = asyncHandler(async (req, res, next) => {
    await projectService.cleanupOrphanProjects();
    await projectService.cleanupRejectedProjects();

    const studentsWithProjects = await User.find({ role: "Student", project: { $ne: null } })
        .select("project")
        .lean();

    const activeProjectIds = studentsWithProjects
        .map((student) => student.project)
        .filter(Boolean);

    const [
        totalStudents,
        totalTeachers,
        totalProjects,
        panels,
        completedProjects,
        approvedProjects,
        pendingProjects,
    ] = await Promise.all([
    User.countDocuments({ role: "Student" }),
    User.countDocuments({ role: "Teacher" }),
    Project.countDocuments({ _id: { $in: activeProjectIds } }),
    panelService.getAllPanels(),
    Project.countDocuments({ _id: { $in: activeProjectIds }, status: "completed" }),
    Project.countDocuments({ _id: { $in: activeProjectIds }, status: "approved" }),
    Project.countDocuments({ _id: { $in: activeProjectIds }, status: "pending" }),
    ]);

  // Returns flat data object — no nested "stats" key
    res.status(200).json({
    success: true,
    message: "Dashboard stats fetched successfully",
    data: {
        totalStudents,
        totalTeachers,
        totalPanels: panels.length,
        totalProjects,
        completedProjects,
        approvedProjects,
        pendingProjects,
    },
    });
});


export const createStudent = asyncHandler(async (req, res, next) => {
    const { name, email, password, department } = req.body;
    if (!name || !email || !password || !department) {
        return next(new ErrorHandler("Please fill all fields", 400));
    }

    const existingUser = await findExistingUserByEmail(email);
    if (existingUser) {
        return next(
            new ErrorHandler(
                `Email already registered as ${existingUser.role}: ${existingUser.name}`,
                400
            )
        );
    }

    const user = await userServices.createUser({ 
        name, 
        email: String(email).trim().toLowerCase(),
        password, 
        department,
        role: "Student", 
    });

    await notificationService.notifyUser(
        req.user._id,
        `${req.user.name || "Admin"} created a new student: ${user.name}`,
        "system",
        "/admin/students",
        "low"
    );

    res.status(201).json({
        success: true,
        message: "Student created successfully",
        data : {user},
    }); 
});


export const bulkCreateStudents = asyncHandler(async (req, res, next) => {
    const uploadedFile = req.file;

    if (!uploadedFile) {
        return next(new ErrorHandler("Please upload a CSV or Excel file", 400));
    }

    const fileExt = String(uploadedFile.originalname || "")
        .toLowerCase()
        .slice(String(uploadedFile.originalname || "").lastIndexOf("."));

    if (!ALLOWED_BULK_EXTENSIONS.includes(fileExt)) {
        return next(new ErrorHandler("Only .csv, .xls and .xlsx files are allowed", 400));
    }

    let rows = [];
    try {
        rows = parseSpreadsheetRows(uploadedFile.path);
    } catch (error) {
        return next(new ErrorHandler("Unable to read the uploaded file. Please check format.", 400));
    } finally {
        if (uploadedFile?.path && fs.existsSync(uploadedFile.path)) {
            fs.unlinkSync(uploadedFile.path);
        }
    }

    if (!rows.length) {
        return next(
            new ErrorHandler(
                "Uploaded file has no data rows. Add at least one student row below the header.",
                400
            )
        );
    }

    const seenEmails = new Set();
    const failedRows = [];
    const validRows = [];

    rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const name = getFieldValue(row, ["name", "student_name", "studentname", "full_name", "fullname"]);
        const emailRaw = getFieldValue(row, ["email", "mail"]);
        const password = getFieldValue(row, ["password", "pass"]);
        const department = normalizeDepartment(getFieldValue(row, ["department", "dept"]));
        const email = String(emailRaw || "").trim().toLowerCase();
        const reasons = [];

        if (!name) reasons.push("Name is required");
        if (!email) reasons.push("Email is required");
        if (email && !isValidEmail(email)) reasons.push("Invalid email format");
        if (!password) reasons.push("Password is required");
        if (password && password.length < 8) reasons.push("Password must be at least 8 characters");
        if (!department) reasons.push("Department is required");
        if (department && !DEPARTMENT_EXPERTISE_MAP[department]) reasons.push("Department is invalid");

        if (email && seenEmails.has(email)) {
            reasons.push("Duplicate email in uploaded file");
        }

        if (reasons.length) {
            failedRows.push({
                rowNumber,
                name: name || "",
                email: email || "",
                reason: reasons.join("; "),
            });
            return;
        }

        seenEmails.add(email);
        validRows.push({ rowNumber, name, email, password, department, role: "Student" });
    });

    const existingUsers = await User.find({ email: { $in: Array.from(seenEmails) } })
        .select("email name role")
        .lean();
    const existingByEmail = new Map(
        existingUsers.map((user) => [String(user.email || "").toLowerCase(), user])
    );

    const rowsToInsert = [];
    validRows.forEach((row) => {
        const existing = existingByEmail.get(row.email);
        if (existing) {
            failedRows.push({
                rowNumber: row.rowNumber,
                name: row.name,
                email: row.email,
                reason: `Email already registered as ${existing.role}: ${existing.name}`,
            });
            return;
        }
        rowsToInsert.push(row);
    });

    const insertedUsers = [];
    for (const row of rowsToInsert) {
        try {
            const createdUser = await userServices.createUser({
                name: row.name,
                email: row.email,
                password: row.password,
                department: row.department,
                role: "Student",
            });
            insertedUsers.push(toUserSafeObject(createdUser));
        } catch (error) {
            failedRows.push({
                rowNumber: row.rowNumber,
                name: row.name,
                email: row.email,
                reason: extractErrorMessage(error),
            });
        }
    }

    const insertedCount = insertedUsers.length;
    const failedCount = failedRows.length;

    if (insertedCount > 0) {
        await notificationService.notifyUser(
            req.user._id,
            `${req.user.name || "Admin"} uploaded ${insertedCount} students in bulk`,
            "system",
            "/admin/students",
            "low"
        );
    }

    res.status(201).json({
        success: true,
        message: buildBulkSummaryMessage("student", insertedCount, failedCount),
        data: {
            totalRows: rows.length,
            insertedCount,
            failedCount,
            insertedUsers,
            failedRows: failedRows.sort((a, b) => a.rowNumber - b.rowNumber),
        },
    });
});


export const updateStudent = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { oldPassword, newPassword, ...rest } = req.body;
    const updateData = { ...rest };
    delete updateData.role; // Prevent role update

    const user = await User.findById(id).select("+password");
    if(!user){
        return next(new ErrorHandler("Student not found", 404));
    }

    if (user.role !== "Student") {
        return next(new ErrorHandler("User is not a student", 400));
    }

    if ((oldPassword && !newPassword) || (!oldPassword && newPassword)) {
        return next(new ErrorHandler("Both old password and new password are required", 400));
    }

    if (oldPassword && newPassword) {
        const isOldPasswordValid = await user.comparePassword(oldPassword);
        if (!isOldPasswordValid) {
            return next(new ErrorHandler("Old password is incorrect", 400));
        }
        user.password = newPassword;
    }

    if (updateData.email) {
        const existingUser = await findExistingUserByEmail(updateData.email);
        if (existingUser && String(existingUser._id) !== String(user._id)) {
            return next(
                new ErrorHandler(
                    `Email already registered as ${existingUser.role}: ${existingUser.name}`,
                    400
                )
            );
        }
        updateData.email = String(updateData.email).trim().toLowerCase();
    }

    Object.entries(updateData).forEach(([key, value]) => {
        user[key] = value;
    });

    await user.save();
    const safeUser = user.toObject();
    delete safeUser.password;

    res.status(200).json({
        success: true,
        message: "Student updated successfully",
        data : {user: safeUser},
    });
});


export const deleteStudent = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const user = await userServices.getUserById(id);
    if(!user){
        return next(new ErrorHandler("Student not found", 404));
    }   
    if(user.role !== "Student"){
        return next(new ErrorHandler("User is not a student", 400));
    }

    await userServices.deleteUser(id);

    try {
        await notificationService.notifyUser(
            req.user._id,
            `${req.user.name || "Admin"} deleted student: ${user.name}`,
            "delete",
            "/admin/students",
            "high"
        );
    } catch (notifyError) {
        console.error("Delete student notification failed:", notifyError.message);
    }

    res.status(200).json({
        success: true,
        message: "Student deleted successfully",
    });
});



//For Teacher

export const createTeacher = asyncHandler(async (req, res, next) => {
    const { name, email, department, expertise, password} = req.body; 
    if (!name || !email || !password || !department || !expertise) {
        return next(new ErrorHandler("Please fill all fields", 400));
    }   

    const normalizedDepartment = normalizeDepartment(department);
    const allowedExpertise = DEPARTMENT_EXPERTISE_MAP[normalizedDepartment] || [];
    const expertiseList = Array.isArray(expertise)
        ? expertise
        : typeof expertise === "string" && expertise.trim() !== ""
        ? expertise.split(",").map((s) => s.trim())
        : [];

    const hasInvalidExpertise = expertiseList.some(
        (item) => !allowedExpertise.includes(item)
    );

    if (hasInvalidExpertise) {
        return next(
            new ErrorHandler(
                "Selected expertise does not belong to the selected department",
                400
            )
        );
    }

    const existingUser = await findExistingUserByEmail(email);
    if (existingUser) {
        return next(
            new ErrorHandler(
                `Email already registered as ${existingUser.role}: ${existingUser.name}`,
                400
            )
        );
    }

    const user = await userServices.createUser({ 
        name, 
        email: String(email).trim().toLowerCase(),
        department: normalizedDepartment,
        expertise: expertiseList,
        password, 
        role: "Teacher", 
    });

    await notificationService.notifyUser(
        req.user._id,
        `${req.user.name || "Admin"} created a new teacher: ${user.name}`,
        "system",
        "/admin/teachers",
        "low"
    );

    res.status(201).json({
        success: true,
        message: "Teacher created successfully",
        data : {user},
    }); 
});


export const bulkCreateTeachers = asyncHandler(async (req, res, next) => {
    const uploadedFile = req.file;

    if (!uploadedFile) {
        return next(new ErrorHandler("Please upload a CSV or Excel file", 400));
    }

    const fileExt = String(uploadedFile.originalname || "")
        .toLowerCase()
        .slice(String(uploadedFile.originalname || "").lastIndexOf("."));

    if (!ALLOWED_BULK_EXTENSIONS.includes(fileExt)) {
        return next(new ErrorHandler("Only .csv, .xls and .xlsx files are allowed", 400));
    }

    let rows = [];
    try {
        rows = parseSpreadsheetRows(uploadedFile.path);
    } catch (error) {
        return next(new ErrorHandler("Unable to read the uploaded file. Please check format.", 400));
    } finally {
        if (uploadedFile?.path && fs.existsSync(uploadedFile.path)) {
            fs.unlinkSync(uploadedFile.path);
        }
    }

    if (!rows.length) {
        return next(
            new ErrorHandler(
                "Uploaded file has no data rows. Add at least one teacher row below the header.",
                400
            )
        );
    }

    const seenEmails = new Set();
    const failedRows = [];
    const validRows = [];

    rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const name = getFieldValue(row, ["name", "teacher_name", "teachername", "full_name", "fullname"]);
        const emailRaw = getFieldValue(row, ["email", "mail"]);
        const password = getFieldValue(row, ["password", "pass"]);
        const department = normalizeDepartment(getFieldValue(row, ["department", "dept"]));
        const expertiseRaw = getFieldValue(row, ["expertise", "specialization", "domain"]);
        const expertiseList = parseExpertise(expertiseRaw);
        const email = String(emailRaw || "").trim().toLowerCase();
        const reasons = [];

        if (!name) reasons.push("Name is required");
        if (!email) reasons.push("Email is required");
        if (email && !isValidEmail(email)) reasons.push("Invalid email format");
        if (!password) reasons.push("Password is required");
        if (password && password.length < 8) reasons.push("Password must be at least 8 characters");
        if (!department) reasons.push("Department is required");
        if (department && !DEPARTMENT_EXPERTISE_MAP[department]) reasons.push("Department is invalid");
        if (!expertiseList.length) reasons.push("Expertise is required");

        if (department && expertiseList.length) {
            const allowedExpertise = DEPARTMENT_EXPERTISE_MAP[department] || [];
            const invalidExpertise = expertiseList.filter((item) => !allowedExpertise.includes(item));
            if (invalidExpertise.length) {
                reasons.push(
                    `Invalid expertise for ${department}: ${invalidExpertise.join(", ")}`
                );
            }
        }

        if (email && seenEmails.has(email)) {
            reasons.push("Duplicate email in uploaded file");
        }

        if (reasons.length) {
            failedRows.push({
                rowNumber,
                name: name || "",
                email: email || "",
                reason: reasons.join("; "),
            });
            return;
        }

        seenEmails.add(email);
        validRows.push({
            rowNumber,
            name,
            email,
            password,
            department,
            expertise: expertiseList,
            role: "Teacher",
        });
    });

    const existingUsers = await User.find({ email: { $in: Array.from(seenEmails) } })
        .select("email name role")
        .lean();
    const existingByEmail = new Map(
        existingUsers.map((user) => [String(user.email || "").toLowerCase(), user])
    );

    const rowsToInsert = [];
    validRows.forEach((row) => {
        const existing = existingByEmail.get(row.email);
        if (existing) {
            failedRows.push({
                rowNumber: row.rowNumber,
                name: row.name,
                email: row.email,
                reason: `Email already registered as ${existing.role}: ${existing.name}`,
            });
            return;
        }
        rowsToInsert.push(row);
    });

    const insertedUsers = [];
    for (const row of rowsToInsert) {
        try {
            const createdUser = await userServices.createUser({
                name: row.name,
                email: row.email,
                password: row.password,
                department: row.department,
                expertise: row.expertise,
                role: "Teacher",
            });
            insertedUsers.push(toUserSafeObject(createdUser));
        } catch (error) {
            failedRows.push({
                rowNumber: row.rowNumber,
                name: row.name,
                email: row.email,
                reason: extractErrorMessage(error),
            });
        }
    }

    const insertedCount = insertedUsers.length;
    const failedCount = failedRows.length;

    if (insertedCount > 0) {
        await notificationService.notifyUser(
            req.user._id,
            `${req.user.name || "Admin"} uploaded ${insertedCount} teachers in bulk`,
            "system",
            "/admin/teachers",
            "low"
        );
    }

    res.status(201).json({
        success: true,
        message: buildBulkSummaryMessage("teacher", insertedCount, failedCount),
        data: {
            totalRows: rows.length,
            insertedCount,
            failedCount,
            insertedUsers,
            failedRows: failedRows.sort((a, b) => a.rowNumber - b.rowNumber),
        },
    });
});


export const updateTeacher = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { oldPassword, newPassword, ...rest } = req.body;
    const updateData = { ...rest };
    delete updateData.role; // Prevent role update

    const user = await User.findById(id).select("+password");
    if(!user){
        return next(new ErrorHandler("Teacher not found", 404));
    }

    if (user.role !== "Teacher") {
        return next(new ErrorHandler("User is not a teacher", 400));
    }

    if ((oldPassword && !newPassword) || (!oldPassword && newPassword)) {
        return next(new ErrorHandler("Both old password and new password are required", 400));
    }

    if (oldPassword && newPassword) {
        const isOldPasswordValid = await user.comparePassword(oldPassword);
        if (!isOldPasswordValid) {
            return next(new ErrorHandler("Old password is incorrect", 400));
        }
        user.password = newPassword;
    }

    if (updateData.email) {
        const existingUser = await findExistingUserByEmail(updateData.email);
        if (existingUser && String(existingUser._id) !== String(user._id)) {
            return next(
                new ErrorHandler(
                    `Email already registered as ${existingUser.role}: ${existingUser.name}`,
                    400
                )
            );
        }
        updateData.email = String(updateData.email).trim().toLowerCase();
    }

    Object.entries(updateData).forEach(([key, value]) => {
        user[key] = value;
    });

    await user.save();
    const safeUser = user.toObject();
    delete safeUser.password;

    res.status(200).json({
        success: true,
        message: "Teacher updated successfully",
        data : {user: safeUser},
    });
});


export const deleteTeacher = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const user = await userServices.getUserById(id);
    if(!user){
        return next(new ErrorHandler("Teacher not found", 404));
    }   
    if(user.role !== "Teacher"){
        return next(new ErrorHandler("User is not a teacher", 400));
    }

    await userServices.deleteUser(id);

    try {
        await notificationService.notifyUser(
            req.user._id,
            `${req.user.name || "Admin"} deleted teacher: ${user.name}`,
            "delete",
            "/admin/teachers",
            "high"
        );
    } catch (notifyError) {
        console.error("Delete teacher notification failed:", notifyError.message);
    }

    res.status(200).json({
        success: true,
        message: "Teacher deleted successfully",
    });
});


export const getAllUsers = asyncHandler(async (req, res, next) => {
    const users = await userServices.getAllUsers();
    res.status(200).json({
        success: true,
        message: "Users fetched successfully",
        data: {users},
    });
});



export const createPanel = asyncHandler(async (req, res, next) => {
    const { panelName, teachers, department } = req.body;

    if (!panelName || !teachers || teachers.length !== 3 || !department) {
        return next(
            new ErrorHandler("Panel name, department and exactly 3 teachers are required", 400)
        );
    }

    const normalizedDepartment = normalizeDepartment(department);

    const teacherUsers = await User.find({
        _id: { $in: teachers },
        role: "Teacher",
    });

    if (teacherUsers.length !== 3) {
        return next(
            new ErrorHandler("All 3 selected users must be valid teachers", 400)
        );
    }

    const hasDifferentDepartment = teacherUsers.some(
        (teacher) => normalizeDepartment(teacher.department) !== normalizedDepartment
    );

    if (hasDifferentDepartment) {
        return next(
            new ErrorHandler(
                "All selected teachers must belong to the same selected department",
                400
            )
        );
    }

    const panelData = {
        panelName,
        teachers,
        department: normalizedDepartment,
        createdBy: req.user._id,
    };

    const panel = await panelService.createPanel(panelData);

    await panel.populate("teachers", "name email department expertise");

    res.status(201).json({
        success: true,
        message: "Panel created successfully",
        data: { panel },
    });
});


export const getAllPanels = asyncHandler(async (req, res, next) => {
    const panels = await panelService.getAllPanels();

    res.status(200).json({
    success: true,
    data: { panels },
    });
});


export const deletePanel = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    await panelService.deletePanel(id);

    res.status(200).json({
    success: true,
    message: "Panel deleted successfully",
    });
});


export const getAllTeachers = asyncHandler(async (req, res, next) => {
    const teachers = await User.find({
    role: "Teacher",
    panel: null,          
    }).select("name email department expertise");

    res.status(200).json({
    success: true,
    data: { teachers },
    });
});


export const getAllTeachersCount = asyncHandler(async (req, res, next) => {
    const count = await User.countDocuments({ role: "Teacher" });

    res.status(200).json({
        success: true,
        data: { count },
    });
});


export const assignPanel = asyncHandler(async (req, res, next) => {
    const { studentId, panelId } = req.body;

    if(!studentId || !panelId) {
        return next(new ErrorHandler("Please provide both student ID and panel ID", 400));
    }

    const project = await Project.findone({ student: studentId });

    if(!project) {
        return next(new ErrorHandler("Project not found", 404));
    }

    if(project.panel !== null) {
        return next(new ErrorHandler("Panel already assigned", 400));
    }

    if(project.status !== "approved") {
        return next(new ErrorHandler("Project not approved yet", 400));
    } else if(project.status === "pending" || project.status === "rejected") {
        return next(new ErrorHandler("Project is in pending state or rejected", 400));
    }

    const { student, panel} = await panelService.assignPanelToDirectly(studentId, panelId);

    project.panel = panel;
    await project.save();

    await notificationService.notifyUser(
        studentId,
        `you have been assigned to panel ${panel.name}`, 
        "approval",
        "/student/status",
        "low"
    );

});



//Project

export const getAllProjects = asyncHandler(async (req, res, next) => {
    await projectService.cleanupOrphanProjects();
    const projects = await projectService.getAllProjects();

    res.json({
        success : true,
        message : "Projects fetched successfully",
        data : { projects },
    });
});


export const getUnassignedStudents = asyncHandler(async (req, res, next) => {
    const validPanelIds = await Panel.distinct("_id");

    const students = await User.find({
        role: { $regex: /^student$/i },
        $or: [
            { panel: null },
            { panel: { $exists: false } },
            { panel: { $nin: validPanelIds } },
        ],
    })
    .select("name email department panel project")
    .sort({ createdAt: -1 })
    .lean();

    const enrichedStudents = await Promise.all(
        students.map(async (student) => {
            let project = null;

            if (student.project) {
                project = await Project.findById(student.project)
                    .select("title status")
                    .lean();
            }

            if (!project) {
                project = await Project.findOne({ student: student._id })
                    .select("title status")
                    .sort({ createdAt: -1 })
                    .lean();
            }

            return {
                ...student,
                project: project || null,
            };
        })
    );

    res.json({
    success: true,
    message: "Unassigned students fetched successfully",
    data: { students: enrichedStudents },
    });
}
);

export const getPanelStudents = asyncHandler(async (req, res, next) => {
    const { panelId } = req.params;

    const students = await User.find({ role: "Student", panel: panelId })
    .select("name email department project")
    .sort({ createdAt: -1 })
    .lean();

    const enrichedStudents = await Promise.all(
        students.map(async (student) => {
            let project = null;

            if (student.project) {
                project = await Project.findById(student.project)
                    .select("title status")
                    .lean();
            }

            if (!project) {
                project = await Project.findOne({ student: student._id })
                    .select("title status")
                    .sort({ createdAt: -1 })
                    .lean();
            }

            return {
                ...student,
                project: project || null,
            };
        })
    );

    res.status(200).json({
    success: true,
    data: { students: enrichedStudents },
    });
});


export const assignStudentsToPanel = asyncHandler(async (req, res, next) => {
    const { panelId, studentIds } = req.body;

    if (!panelId || !Array.isArray(studentIds) || studentIds.length === 0) {
    return next(new ErrorHandler("panelId and studentIds array are required", 400));
    }

  // Check panel exists
  const panel = await panelService.getPanelById(panelId); // or Panel.findById(panelId)
    if (!panel) {
    return next(new ErrorHandler("Panel not found", 404));
    }

        const panelDepartment = normalizeDepartment(panel.department);
        if (!panelDepartment) {
                return next(new ErrorHandler("Selected panel has no department configured", 400));
        }

  // Count how many students are already in this panel
    const existingCount = await User.countDocuments({ role: "Student", panel: panelId });

    if (existingCount + studentIds.length > 15) {
    return next(
        new ErrorHandler(
        `Cannot assign ${studentIds.length} students. Panel already has ${existingCount}/15 students.`,
        400
        )
    );
    }

    const validPanelIds = await Panel.distinct("_id");

    const students = await User.find({
        _id: { $in: studentIds },
        role: { $regex: /^student$/i },
    }).select("_id department panel");

    const hasWrongDepartment = students.some(
        (student) => normalizeDepartment(student.department) !== panelDepartment
    );

    if (hasWrongDepartment) {
        return next(
            new ErrorHandler(
                `Only ${panelDepartment} department students can be assigned to this panel`,
                400
            )
        );
    }

  // Assign panel to each eligible student
    await User.updateMany(
    {
        _id: { $in: studentIds },
        role: { $regex: /^student$/i },
        $or: [
            { panel: null },
            { panel: { $exists: false } },
            { panel: { $nin: validPanelIds } },
        ],
    },
    { $set: { panel: panelId } }
    );

    res.status(200).json({
    success: true,
    message: `${studentIds.length} student(s) assigned to panel successfully`,
    });
});


export const removeStudentFromPanel = asyncHandler(async (req, res, next) => {
    const { panelId, studentId } = req.params;

    const student = await User.findOne({ _id: studentId, role: "Student", panel: panelId });
    if (!student) {
    return next(new ErrorHandler("Student not found in this panel", 404));
    }

    student.panel = null;
    await student.save();

    res.status(200).json({
    success: true,
    message: "Student removed from panel successfully",
    });
});


export const sendFeedbackToPanel = asyncHandler(async (req, res, next) => {
    const { panelId } = req.params;
    const { title, type = "general", description, message } = req.body;

    const feedbackMessage = String(description || message || "").trim();
    const normalizedType = String(type || "general").toLowerCase();
    const allowedTypes = ["general", "positive", "negative"];

    if (!title || !feedbackMessage) {
        return next(new ErrorHandler("Feedback title and description are required", 400));
    }

    if (!allowedTypes.includes(normalizedType)) {
        return next(new ErrorHandler("Invalid feedback type", 400));
    }

    const panel = await Panel.findById(panelId).populate("teachers", "name role");
    if (!panel) {
        return next(new ErrorHandler("Panel not found", 404));
    }

    const teacherIds = (panel.teachers || [])
        .filter((teacher) => String(teacher?.role || "").toLowerCase() === "teacher")
        .map((teacher) => teacher._id);

    if (!teacherIds.length) {
        return next(new ErrorHandler("No teachers found in this panel", 400));
    }

    await Promise.all(
        teacherIds.map((teacherId) =>
            notificationService.notifyUser(
                teacherId,
                `Admin feedback for ${panel.panelName}: ${title} - ${feedbackMessage}`,
                "feedback",
                "/teacher",
                normalizedType === "negative" ? "high" : normalizedType === "positive" ? "low" : "medium"
            )
        )
    );

    await notificationService.notifyUser(
        req.user._id,
        `You sent feedback to ${panel.panelName} (${teacherIds.length} teacher${teacherIds.length > 1 ? "s" : ""}): ${title}`,
        "feedback",
        "/admin",
        normalizedType === "negative" ? "high" : normalizedType === "positive" ? "low" : "medium"
    );

    res.status(200).json({
        success: true,
        message: "Feedback sent to all panel teachers successfully",
        data: {
            panelId: panel._id,
            panelName: panel.panelName,
            receivers: teacherIds.length,
        },
    });
});


export const sendFeedbackToStudent = asyncHandler(async (req, res, next) => {
    const { studentId } = req.params;
    const { title, type = "general", description, message } = req.body;

    const feedbackMessage = String(description || message || "").trim();
    const normalizedType = String(type || "general").toLowerCase();
    const allowedTypes = ["general", "positive", "negative"];

    if (!title || !feedbackMessage) {
        return next(new ErrorHandler("Feedback title and description are required", 400));
    }

    if (!allowedTypes.includes(normalizedType)) {
        return next(new ErrorHandler("Invalid feedback type", 400));
    }

    const student = await User.findOne({ _id: studentId, role: "Student" }).select("_id name panel");
    if (!student) {
        return next(new ErrorHandler("Student not found", 404));
    }

    const project = await Project.findOne({ student: student._id })
        .sort({ createdAt: -1 })
        .select("_id title panel student");

    if (!project) {
        return next(new ErrorHandler("Student project not found", 404));
    }

    const { latestFeedback } = await projectService.addFeedback(
        project._id,
        req.user._id,
        feedbackMessage,
        title,
        normalizedType
    );

    await notificationService.notifyUser(
        student._id,
        `You have received new feedback from admin on your project \"${project.title}\".`,
        "feedback",
        "/student/feedback",
        normalizedType === "negative" ? "high" : normalizedType === "positive" ? "low" : "medium"
    );

    const panelId = project.panel || student.panel;
    if (panelId) {
        const panel = await Panel.findById(panelId).select("teachers").lean();
        const teacherIds = (panel?.teachers || []).map((id) => String(id));

        await Promise.all(
            teacherIds.map((teacherId) =>
                notificationService.notifyUser(
                    teacherId,
                    `Admin posted feedback on ${student.name}'s project: ${title}`,
                    "feedback",
                    "/teacher/students",
                    "medium"
                )
            )
        );
    }

    await notificationService.notifyUser(
        req.user._id,
        `You sent feedback to student ${student.name}: ${title}`,
        "feedback",
        "/admin",
        normalizedType === "negative" ? "high" : normalizedType === "positive" ? "low" : "medium"
    );

    res.status(200).json({
        success: true,
        message: "Feedback sent to student successfully",
        data: {
            studentId: student._id,
            projectId: project._id,
            feedback: latestFeedback,
        },
    });
});
