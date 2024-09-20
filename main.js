const { createServer } = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const speech = require("@google-cloud/speech");
const path = require("path");
const twilio = require("twilio")
const Grok = require("groq-sdk")
require('dotenv').config();

const app = express();
const server = createServer(app);
const accountSid = process.env.accountSid;
const authToken = process.env.authToken;
// the WebSocket server for the Twilio media stream to connect to.
const wss = new WebSocketServer({ server });

// app.get('/', (_, res) => res.type('text').send('Twilio media stream transcriber'));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "/index.html")));

// Tell Twilio to say something and then establish a media stream with the WebSocket server
app.post('/', async (req, res) => {

  res.type('xml')
    .send(
      `<Response>
        <Say>
          Welcome to Legal Saathi AI
        </Say>
        <Say>After The Beep, Please Ask your legal query and we will call you back with the response</Say>
        <Connect>
          <Stream url='wss://${req.headers.host}' />
        </Connect>
      </Response>`
    );
});

wss.on('connection', async (ws) => {
  console.log('Twilio media stream WebSocket connected')
  //Include Google Speech to Text
const client = new speech.SpeechClient();

//Configure Transcription Request
const request = {
  config: {
    encoding: "MULAW",
    sampleRateHertz: 8000,
    languageCode: "en-IN"
  },
  interimResults: true
};
  // const transcriber = new RealtimeService({
  //   apiKey: process.env.ASSEMBLYAI_API_KEY,
  //   // Twilio media stream sends audio in mulaw format
  //   encoding: 'pcm_mulaw',
  //   // Twilio media stream sends audio at 8000 sample rate
  //   sampleRate: 8000
  // })
  // const transcriberConnectionPromise = transcriber.connect();

  // transcriber.on('transcript.partial', (partialTranscript) => {
  //   // Don't print anything when there's silence
  //   if (!partialTranscript.text) return;
  //   console.clear();
  //   console.log(partialTranscript.text);
  // });

  // transcriber.on('transcript.final', (finalTranscript) => {
  //   console.clear();
  //   console.log(finalTranscript.text);
  // });

  // transcriber.on('open', () => console.log('Connected to real-time service'));
  // transcriber.on('error', console.error);
  // transcriber.on('close', () => console.log('Disconnected from real-time service'));

  // Message from Twilio media stream
  let recognizeStream = null;
   let getAllMessages = ""
  ws.on('message', async (message) => {
      
    const msg = JSON.parse(message)
    switch (msg.event) {
      case 'connected':
        console.info('Twilio media stream connected');
        recognizeStream = client
        .streamingRecognize(request)
        .on("error", console.error)
        .on("data", data => {
          // console.log(data.results[0].alternatives[0].transcript);
          getAllMessages += data.results[0].alternatives[0].transcript
          wss.clients.forEach( client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                event: "interim-transcription",
                text: data.results[0].alternatives[0].transcript
              })
            );
          }
        });
        });
        break;

      case 'start':
        console.info('Twilio media stream started');
        break;

      case 'media':
        // Make sure the transcriber is connected before sending audio
        // await transcriberConnectionPromise;
        // transcriber.sendAudio(Buffer.from(msg.media.payload, 'base64'));
        recognizeStream.write(msg.media.payload);

        break;

      case 'stop':
        console.info('Twilio media stream stopped');
        const twilioBot = twilio(accountSid, authToken);
        recognizeStream.destroy();

      
async function fetchCall() {
  const call = await twilioBot.calls(msg.stop.callSid).fetch();
  const groq = new Grok({ apiKey: process.env.groqAPI });
  const cleanOutput = await groq.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `Here is a transcription of a legal query, please rewrite it the transcription, It will be always related to indian law, Here is the transcription: ${getAllMessages}. return the Answer of the query asked by the person`,
      },
    ],
    model: "llama3-8b-8192",
  });
  console.log(cleanOutput.choices[0]?.message?.content)
  // const getAIResponse = await fetch("https://legalsaathi.vshubham.com", {method: "POST", body: JSON.stringify({query: `This is a Transcribed Audio About a query, answer it: ${cleanOutput.choices[0]?.message?.content}`})}).then(res => res.json());
  // console.log(getAIResponse, getAIResponse.details)
  const callBack = await twilioBot.calls.create({
    from: "+18184524139",
    to: call.fromFormatted,
    twiml: `<Response><Say>Here is the answer to the question you asked: ${cleanOutput.choices[0]?.message?.content}</Say></Response>`,
  });
  console.log(call.from, callBack);
}

        fetchCall();
        break;
    }
  });

  ws.on('close', async () => {
    console.log('Twilio media stream WebSocket disconnected');
    console.log(getAllMessages)
    // await transcriber.close();
  })

  // await transcriberConnectionPromise;
});

console.log('Listening on port 8080');
server.listen(8080);
