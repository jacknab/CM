require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sessionMiddleware = require('./sessionMiddleware');

const connectionTokenRoute = require('./routes/connectionToken');
const paymentIntentRoute = require('./routes/paymentIntent');
const terminalLocationRoute = require('./routes/terminalLocation');
const readerRoute = require('./routes/reader');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(sessionMiddleware);

app.use('/stripe', connectionTokenRoute);
app.use('/stripe', paymentIntentRoute);
app.use('/stripe', terminalLocationRoute);
app.use('/stripe', readerRoute);

app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4242;
app.listen(port, () => {
  console.log(`Terminal backend listening on port ${port}`);
});
