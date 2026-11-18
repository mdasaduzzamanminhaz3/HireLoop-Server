import express from 'express'
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)


const app = express()
const port = process.env.PORT || 5000 ;
app.use(express.json());
app.use(cors());


const myLooger = (req,res,next)=> {
  console.log("Now hitting api", req.url, req.headers);
  next();
}

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
const sessions = database.collection("session");
const jobs = database.collection("jobs");
const applications = database.collection("applications");
const payments = database.collection("payments");


// custom middleware
const verifyToken = async(req,res,next) => {
  const authHeader = req.headers.authorization
  // console.log("token: ",authHeader);
  if(!authHeader){
    res.status(401).send({ message:'Unauthorized'});
    return;
  }
  const token = authHeader.split(' ')[1];
  if(!token){
    res.status(401).send({ message:'Unauthorized'});
    return;
  }
  const query = {token};
  const session = await sessions.findOne(query);
  if(!session){
    res.status(401).send({ message:'Unauthorized'});
    return;
  }
  const userId = session.userId;
  const userQuery = {_id: new ObjectId(userId)}
  const user = await users.findOne(userQuery);
  if(!user){
    res.status(401).send({ message:'Unauthorized'});
    return
  }
  req.user = user;
  next()
}

// must call this middleware after verifyToken
const verifySeeker = async(req,res,next) => {
  if(req.user.role !== 'seeker' ){
    req.status(403).send({message:'Forbidden'});
    return
  }
  next();
}
const verifyRecruiter= async(req,res,next) => {
  if(req.user.role !== 'recruiter' ){
    req.status(403).send({message:'Forbidden'});
    return
  }
  next();
}
const verifyAdmin= async(req,res,next) => {
  if(req.user.role !== 'admin' ){
    req.status(403).send({message:'Forbidden'});
    return
  }
  next();
}



app.post('/job/create',verifyToken,verifyRecruiter,async(req,res)=> {
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
    if(req.query.recruiterId){
      query.recruiterId = req.query.recruiterId;
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
app.post('/applications',verifyToken,verifySeeker,async(req,res) => {
  const application = req.body;
  const result = await applications.insertOne(application);
  res.send(result)
})


app.get('/applications',myLooger,verifyToken,async(req,res)=> {
  const query = {};
  if(req.query.applicantId){
    query.userId= req.query.applicantId;
  }
  if(req.query.jobId){
    const jobQuery = {_id: new ObjectId(req.query.jobId)};
    const job = await jobs.findOne(jobQuery)
    if(job.recruiterId !== req.user._id.toString() && req.user.role !=='admin'){
      res.status(403).send({ message:'Forbidden'});
      return
    }
    query.jobId= req.query.jobId;
  }
  const cursor = applications.find(query);
  const result = await cursor.toArray();
  res.send(result);
})

// only these values may be written to an application's status
const APPLICATION_STATUSES = ["applied", "shortlisted", "interview", "rejected", "hired"];

app.patch('/applications/:id',async(req,res)=> {
  const { id } = req.params;
  const { status } = req.body;

  // reject malformed ids instead of crashing with a 500 (ObjectId throws on bad input)
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ success: false, message: 'Invalid application id' });
  }

  // reject unknown status values so garbage data never reaches the collection
  if (!APPLICATION_STATUSES.includes(status)) {
    return res.status(400).send({
      success: false,
      message: `Invalid status. Allowed values: ${APPLICATION_STATUSES.join(', ')}`,
    });
  }

  const result = await applications.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );

  // id was valid but no application matched it
  if (result.matchedCount === 0) {
    return res.status(404).send({ success: false, message: 'Application not found' });
  }

  res.send({ success: true, result });
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

app.patch('/users/:id/role',verifyToken,verifyAdmin,async(req,res)=> {
const id = req.params.id;
const query = {_id: new ObjectId(id)};
const updatedDoc = {
  $set:{
    role: req.body.role,
  }
}
const result = await users.updateOne(query,updatedDoc);
res.send(result);
})

app.get('/',(req,res)=> {
    res.send("hire loop is looping")
})


app.listen(port,()=> {
    console.log(`server is running on port ${port}`);
})