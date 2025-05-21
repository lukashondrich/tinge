const { spawn } = require("child_process");
const qrcode = require("qrcode-terminal");
const net = require("net");

function waitForPort(port, host, callback) {
  const tryConnect = () => {
    const socket = net.connect(port, host, () => {
      socket.end();
      callback();
    });
    socket.on("error", () => setTimeout(tryConnect, 500));
  };
  tryConnect();
}

waitForPort(5173, "127.0.0.1", () => {
  const tunnel = spawn("cloudflared", ["tunnel", "--url", "http://127.0.0.1:5173"]);

  function handleData(data) {
    const output = data.toString();
    const match = output.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
    if (match) {
      const url = match[0];
      console.log("\n🌐 Public URL:", url);
      console.log("📱 Scan this QR code to open on your phone:\n");
      qrcode.generate(url, { small: true });
    }
  }

  tunnel.stdout.on("data", handleData);
  tunnel.stderr.on("data", handleData); // 👈 Cloudflare logs go here

  tunnel.on("exit", (code) => {
    console.log(`cloudflared exited with code ${code}`);
  });
});
