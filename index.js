const express = require('express');
require("dotenv").config();
const app = express();
const PORT = process.env.PORT;


app.get('/',(req,res)=>{
    res.status(200).json({message:'Testing...'});
});

app.listen(PORT,()=>{
  console.log(`app is running on PORT=${PORT}`);
});