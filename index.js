import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb';
import 'dotenv/config'

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

app.get('/users',async(req,res)=> {
    const cursor = users.find({});
    const result = await cursor.toArray();
    res.send(result);
})

app.get('/',(req,res)=> {
    res.send("hire loop is looping")
})


app.listen(port,()=> {
    console.log(`server is running on port ${port}`);
})