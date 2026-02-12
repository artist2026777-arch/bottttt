
import fs from "fs";
import fetch from "node-fetch";
import { execSync } from "child_process";

const node = process.env.NODE_NAME;
const telegram = process.env.TELEGRAM_TOKEN;
const openrouter = process.env.OPENROUTER_KEY;

let state = JSON.parse(fs.readFileSync("cluster/state.json"));
let offsetData = JSON.parse(fs.readFileSync("cluster/offset.json"));

const now = Date.now();
const TIMEOUT = 90000;

if (!state.master || now - state.last_heartbeat > TIMEOUT) {
  state.master = node;
  state.last_heartbeat = now;
}

if (state.master !== node) process.exit(0);

async function getUpdates() {
  const res = await fetch(
    `https://api.telegram.org/bot${telegram}/getUpdates?offset=${offsetData.offset}`
  );
  return res.json();
}

async function sendMessage(chat, text) {
  await fetch(
    `https://api.telegram.org/bot${telegram}/sendMessage`,
    {method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({chat_id:chat,text})}
  );
}

async function askAI(text) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{
      "Authorization":"Bearer "+openrouter,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"openai/gpt-4o-mini",
      messages:[{role:"user",content:text}]
    })
  });
  const data=await res.json();
  return data.choices?.[0]?.message?.content||"Error";
}

async function run(){
  const updates=await getUpdates();
  if(!updates.result)return;

  for(const u of updates.result){
    offsetData.offset=u.update_id+1;
    if(u.message?.text){
      const reply=await askAI(u.message.text);
      await sendMessage(u.message.chat.id,reply);
    }
  }

  state.last_heartbeat=Date.now();

  fs.writeFileSync("cluster/state.json",JSON.stringify(state,null,2));
  fs.writeFileSync("cluster/offset.json",JSON.stringify(offsetData,null,2));

  execSync("git config user.name 'cluster'");
  execSync("git config user.email 'cluster@bot'");
  execSync("git add .");
  execSync("git commit -m 'heartbeat'");
  execSync("git push");
}

run();
