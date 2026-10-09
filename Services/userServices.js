import User from "../models/user.js";

export const createUser = async (userData) => {
    try{
        const user = new User(userData);
        return await user.save();
    }catch(error){ 
        throw new Error(`Error creating user:  ${error.message}`); 
    }
}; 


export const updateUser = async (id,updateData) => {
    try{
        return await User.findByIdAndUpdate(id, updateData, {
            new: true, 
            runValidators: true,
        }).select("-password");
    }catch(error){ 
        throw new Error(`Error updating user: ${error.message}`); 
    }
}; 


export const getUserById = async (id) => {
    return await User.findById(id).select(
        "-password -resetPasswordToken -resetPasswordExpire" 
    );
};


export const deleteUser = async (id) => {
    const user = await User.findById(id);
    if(!user){ 
        throw new Error("User not found");
    }
    return await user.deleteOne(); 
};


export const getAllUsers = async () => {
    const query = {role: { $ne : "Admin"}};

    const users = await User.find(query)
    .select("-password -resetPasswordToken -resetPasswordExpire" )
    .sort({ createdAt: -1 });

    return users;
};


export const assignPanelToDirectly = async (studentId, panelId) => {
    const student = await User.findOne({_id: studentId, role: "Student"});
    const panel = await User.findOne({_id: panelId, role: "Panel"});
    if(!student || !panel){
        throw new Error("Student or Panel not found");
    }
    if(!panel.hasCapacity()){
        throw new Error("Panel has no capacity available");
    }

    student.panel = panelId;
    panel.assignedStudents.push(studentId);
    await Promise.all([student.save(), panel.save()]);

    return { student, panel };
};