const User = require('../model/userModel');
const Asset = require('../model/assetModel');
const Transaction = require('../model/transactionModel');
const validateMongoDBId = require('../utils/validMongodbId');
const validateOTP = require('../utils/validateOTP');
const mongoose = require('mongoose');

// Update balance helper func
const updateBalance = async (userId, assetId, newBalance)=>{
    try{
        const user = await User.findOne({_id: userId});
        const field = user.balance.assets.find(u => u.assetId.toString() === assetId.toString());
        const index = user.balance.assets.indexOf(field);
        field.amount = newBalance;
        user.balance.assets.set(index, field)
        user.save();
    }catch(err){
        throw new Error(err)
    }
}


const sendAsset =async (req, res, next)=>{
    const { to, assetId, amount, pin}  = req?.body;

    try{
        // body data validation
        if( !to || !assetId || !amount || !pin){
            throw new Error (`Invalid data input.`)
        }
        const receiverId = (typeof(to) === 'string') && to.trim();
        let sendingAmount = parseFloat(amount);
        const validAssetId = validateMongoDBId(assetId.trim()) && assetId.trim();

        // Sending amount checking
        if(sendingAmount <= 0){
            throw new Error('Your balance is to low');
        }else{
            sendingAmount = parseFloat(sendingAmount.toFixed(5));
        }

        // Changeable transaction status
        let transactionStatus;

        // Get sender user data from req
        const sender = req.user;

        // Verify pin by call validateOTP
        // const otp_verification = validateOTP(sender?.authData?.base32, pin);

        // if(!otp_verification){
        //     throw new Error('Invalid authentication code')
        // }
        
        // Find receiver by email or username
        const receiver = await User.findOne(validateMongoDBId(receiverId) ? {_id: receiverId} : {$or: [{email: receiverId}, {username: receiverId}]});

        // Find asset
        const asset = await Asset.findOne({_id: validAssetId});
        
        // Check receiver & asset is valid
        if(!receiver || !asset){
            console.log(receiver)
            throw new Error('Invalid address or asset.')
        }

        // Check receiver and sender is same or not
        if(sender._id.toString() === receiver._id.toString()){
            throw new Error('You can not send asset to your own account')
        }
       
        // Find those asset from sender which will send to receiver
        const senderAsset = sender?.balance?.assets?.find(ast => ast.assetId.toString() === assetId);
        const receiverAsset = receiver?.balance?.assets?.find(ast => ast.assetId.toString() === assetId);

        
        // Sender balance checking
        if(!senderAsset){
            console.log(senderAsset)
            throw new Error('You do not have enough balance 1')
        }

        // Transaction fee calculation
        const transactionFee = (sendingAmount * asset.fee) / 100;
        const AmountWithTransactionFee = transactionFee + sendingAmount;
        const senderTotalAssetAmount = senderAsset.amount;

        // Again check total balance
        if(senderTotalAssetAmount < AmountWithTransactionFee){
             throw new Error('You do not have enough balance')
        }

        // Cut balance and calculate new balance for sender
        const senderNewBalance = senderTotalAssetAmount - AmountWithTransactionFee

        // Update sender balance
        await updateBalance(sender._id, asset._id, senderNewBalance)

        // Update receiver balance____________
        if(!receiverAsset){
            // If receiver do not have any balance previously
            const updateReceiverBalance =await User.updateOne({_id: receiver._id}, {$push: {"balance.assets": {assetId: asset._id, amount: sendingAmount}}}); 

            updateReceiverBalance ? transactionStatus = true : transactionStatus = false;
        }else{
             // If receiver have balance previously
            const receiverOldBalance = receiverAsset.amount;
            const receiverNewBalance = receiverOldBalance + sendingAmount;
            const updateReceiverBalance = await updateBalance(receiver._id, asset._id, receiverNewBalance)

            updateReceiverBalance ? transactionStatus = true : transactionStatus = false;
        }

        // Send transaction fee in to admin
        // Will bet set in later---------------------------------------------

        // Create new transaction data
        const transaction = {
            isSuccess: transactionStatus,
            from: {
                name: sender.name,
                userId: sender.email || sender.username,
                uuid: sender._id
            },
            to: {
                name: receiver.name,
                userId: receiver.email || receiver.username,
                uuid: receiver._id
            },
            amount: sendingAmount,
            transactionFee: transactionFee,
            asset: asset.name,
            assetId: asset._id
        }

        // Save transaction on database
        const createTransaction = await Transaction.create({...transaction});

        // Check transaction is success
        if(!createTransaction){
            throw new Error('Transaction creating failed')
        }

        // Send Success response
        res.status(200).json({
            isSuccess: true,
            transaction: createTransaction
        });

    }catch(err){
        console.log(err)
        next(err)
    }
}


const getAllTransaction = async (req, res, next)=>{
    try{
        const {_id} = req.user;
        const transactions = await Transaction.find({$or: [{"from.uuid": new mongoose.Types.ObjectId(_id)}, {"to.uuid": new mongoose.Types.ObjectId(_id)}]}).limit(5).sort([['createdAt', -1]]);
        res.status(200).json(transactions)
    }catch(err){
        next(err)
    }
}


// Request demo assets
const demoAssetRequest = async (req, res, next) =>{
    const { assetId }  = req?.params;
  
    try{
        console.log(req.body)
        // body data validation
        if( !assetId ){
            throw new Error (`Invalid data input.`)
        }
        const validAssetId = validateMongoDBId(assetId.trim()) && assetId.trim();

        // Get user data from req
        const user = req.user;

        // Find asset
        const asset = await Asset.findOne({_id: validAssetId});

        // Find those asset from sender which will send to user
        const userAsset = user?.balance?.assets?.find(ast => ast.assetId.toString() === assetId);

        // Update user balance____________
        if(!userAsset){
            // If user do not have any balance previously
            await User.updateOne({_id: user._id}, {$push: {"balance.assets": {assetId: asset._id, amount: 5}}}); 

        }else{
             // If user have asset then do not send asset
            if(userAsset.amount >= 5){
                throw new Error("You have enough balance for testing.")
            }
             // If receiver have balance previously
            const userOldBalance = userAsset.amount;
            const userNewBalance = userOldBalance + 2;
            await updateBalance(user?._id, asset?._id, userNewBalance)
        }

        // Send Success response
        res.status(200).json({
            isSuccess: true
        });

    }catch(err){
        console.log(err);
        next(err)
    }
}


module.exports = {sendAsset, getAllTransaction, demoAssetRequest};