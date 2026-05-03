const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../Fontend")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const TOTAL = 1_000_000;

// In-memory storage (Redis nahi chahiye!)
const state = new Uint8Array(Math.ceil(TOTAL / 8));
let checkedCount = 0;

function getBit(i) {
    return (state[Math.floor(i / 8)] >> (7 - (i % 8))) & 1;
}

function setBit(i, val) {
    const byte = Math.floor(i / 8);
    const bit = 7 - (i % 8);
    if (val) state[byte] |= (1 << bit);
    else state[byte] &= ~(1 << bit);
}

function getBitsRange(start, end) {
    const bits = [];
    for (let i = start; i <= Math.min(end, TOTAL - 1); i++) {
        bits.push(getBit(i));
    }
    return bits;
}

const clients = new Set();

function broadcast(data) {
    const msg = JSON.stringify(data);
    clients.forEach((c) => { if (c.readyState === 1) c.send(msg); });
}

wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`Client connected. Total: ${clients.size}`);

    ws.send(JSON.stringify({ type: "stats", checkedCount, totalClients: clients.size }));
    broadcast({ type: "clientCount", totalClients: clients.size });

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);

            if (data.type === "toggle") {
                const { index } = data;
                if (index < 0 || index >= TOTAL) return;
                const cur = getBit(index);
                const newVal = cur ? 0 : 1;
                setBit(index, newVal);
                if (newVal) checkedCount++; else checkedCount--;
                broadcast({ type: "toggle", index, value: newVal, checkedCount });
            }

            if (data.type === "getRange") {
                const bits = getBitsRange(data.start, Math.min(data.end, TOTAL - 1));
                ws.send(JSON.stringify({ type: "rangeData", start: data.start, bits }));
            }

        } catch (e) {
            console.error("Error:", e);
        }
    });

    ws.on("close", () => {
        clients.delete(ws);
        console.log(`Client disconnected. Total: ${clients.size}`);
        broadcast({ type: "clientCount", totalClients: clients.size });
    });
});

app.get("/api/stats", (req, res) => {
    res.json({ checkedCount, totalCheckboxes: TOTAL, totalClients: clients.size });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`WebSocket ready`);
    console.log(`In-Memory mode - Redis nahi chahiye!`);
});