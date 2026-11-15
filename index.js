import express from 'express'
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)


const app = express()
const port = process.env.PORT || 8000 ;
app.use(express.json());
app.use(cors());


const client = new MongoClient(`mongodb://${process.env.DB_USER}:${process.env.DB_SECRET}@ac-nmhfvdj-shard-00-00.sewarun.mongodb.net:27017,ac-nmhfvdj-shard-00-01.sewarun.mongodb.net:27017,ac-nmhfvdj-shard-00-02.sewarun.mongodb.net:27017/?ssl=true&replicaSet=atlas-1na5kl-shard-0&authSource=admin`);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectedClient = await connectToMongoDB();
const database = connectedClient.db('hireloop');
const users = database.collection("user");
const jobs = database.collection("jobs");
const applications = database.collection("applications");
const payments = database.collection("payments");

app.post('/job/create',async(req,res)=> {
  const job = req.body;
  const result = await jobs.insertOne(job);
  res.send(result);
})

app.get('/jobs',async(req,res)=> {
  const query = {};
  // console.log(req.query);
  if(req.query){
    if(req.query.jobType){
      query.jobType = req.query.jobType;
    }
    if(req.query.isRemote){
      query.isRemote = req.query.isRemote ==='true';
    }
    if(req.query.category){
      query.category= req.query.category;
    }
    if(req.query.search){
      query.$or=[
        {title:{$regex:req.query.search, $options:'i'}},
        {responsibilities:{$regex:req.query.search, $options:'i'}},
        {requirements:{$regex:req.query.search, $options:'i'}},

      ]
    }
  }
  const cursor = jobs.find(query);
  const result = await cursor.toArray();
  res.send(result)
})

app.get('/jobs/:id',async(req,res)=>{
  const id = req.params.id;
  const query = {_id:new ObjectId(id)};
  const result = await jobs.findOne(query);
  res.send(result);
})

app.delete('/jobs/:id',async(req,res)=> {
  const id = req.params.id;
  const query = {_id: new ObjectId(id)};
  const result = await jobs.deleteOne(query);
  res.send(result);
})



// application related apis
app.post('/applications',async(req,res) => {
  const application = req.body;
  const result = await applications.insertOne(application);
  res.send(result)
})


app.get('/applications',async(req,res)=> {
  const query = {};
  if(req.query.applicantId){
    query.userId= req.query.applicantId;
  }
  const cursor = applications.find(query);
  const result = await cursor.toArray();
  res.send(result);
})
app.get('/applications/count',async(req,res)=> {
  const query = {};
  if(req.query.applicantId){
    query.userId= req.query.applicantId;
  }
  const result = await applications.countDocuments(query);
  res.send({count:result});
})

// payments related apis
app.post('/payments/checkout-verify',async(req,res)=>{
const {sessionId} = req.body;
if(!sessionId){
  return res.send({success:false, message:'Session Id is required'})
}
const {
      status,
    payment_status,
    customer_email,
    metadata,
    payment_intent,
} = await stripe.checkout.sessions.retrieve(sessionId);
// 1. is used new new session
// 2. check is the session id for the currently logged in user
// 3.insert sessionid into the payment colleciton
// 4.update user information as premium user

if (status === 'complete' && payment_status==="paid"){
  const sessionQuery = {sessionId};
  const existingPayment = await payments.findOne(sessionQuery);
  if(existingPayment){
    return res.send({success:false, message:'Payment already verified'})
  }
  const payment ={
        status,
      payment_status,
      customer_email,
      userId:metadata.userId,
      payment_date:new Date(),
      payment_intent,
  }
  const result = await payments.insertOne(payment);

// update the user table
const query = {_id: new ObjectId(metadata.userId)}

  const updatedDoc = {
    $set:{
      premium:true,
    }
  }

  const updateResult = await users.updateOne(
    query,
    updatedDoc
  );
  res.send({success:true, result, updateResult});
  return
}
res.send({success:false, message:'Payment verification failed'})


})



// users realeted apis
app.get('/users',async(req,res)=> {
    const cursor = users.find({});
    const result = await cursor.toArray();
    res.send(result);
})

app.get('/users/:id/premium',async(req,res)=>{
  const id = req.params.id;
  const query =  {_id: new ObjectId(id)};
  const result = await users.findOne(query,{projection:{premium:1}});
  res.send(result)
})

app.get('/',(req,res)=> {
    res.send("hire loop is looping")
})


app.listen(port,()=> {
    console.log(`server is running on port ${port}`);
})