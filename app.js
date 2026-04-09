const API = "https://backend.g.jrnm.app";

let ws;
let user;
let currentDM = null;
let pc;

// ---------------- LOGIN ----------------

async function login() {
  const res = await fetch(`${API}/auth`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      username: username.value,
      password: password.value
    })
  });

  const data = await res.json();

  if (!data.success) {
    alert("Login failed");
    return;
  }

  user = data.user;

  document.getElementById("login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  me.innerText = user.username;

  connectWS();
  loadFriends();
}

// ---------------- WEBSOCKET ----------------

function connectWS() {
  ws = new WebSocket(`wss://backend.g.jrnm.app/ws/${user.username}`);

  ws.onmessage = async (e) => {
    const data = JSON.parse(e.data);

    if (data.type === "global") {
      addMsg(`[GLOBAL] ${data.user}: ${data.message}`);
    }

    if (data.type === "dm") {
      addMsg(`[DM] ${data.from}: ${data.message}`);
    }

    // CALL SIGNALING
    if (data.type === "call-offer") {
      await handleOffer(data);
    }

    if (data.type === "call-answer") {
      await pc.setRemoteDescription(data.answer);
    }

    if (data.type === "ice-candidate") {
      await pc.addIceCandidate(data.candidate);
    }
  };
}

// ---------------- CHAT ----------------

function send() {
  if (!msg.value) return;

  if (currentDM) {
    ws.send(JSON.stringify({
      type: "dm",
      to: currentDM,
      message: msg.value
    }));
  } else {
    ws.send(JSON.stringify({
      type: "global",
      message: msg.value
    }));
  }

  msg.value = "";
}

function addMsg(text) {
  const div = document.createElement("div");
  div.innerText = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function joinGlobal() {
  currentDM = null;
  addMsg("---- Joined Global Chat ----");
}

// ---------------- FRIENDS ----------------

async function addFriend() {
  await fetch(`${API}/add-friend`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      username: user.username,
      friend: friendInput.value
    })
  });

  loadFriends();
}

async function loadFriends() {
  const res = await fetch(`${API}/friends/${user.username}`);
  const data = await res.json();

  friends.innerHTML = "";

  data.friends.forEach(f => {
    const btn = document.createElement("button");
    btn.innerText = f;

    btn.onclick = () => {
      currentDM = f;
      addMsg(`---- DM with ${f} ----`);
    };

    friends.appendChild(btn);
  });
}

// ---------------- CALL SYSTEM ----------------

async function startCall() {
  if (!currentDM) {
    alert("Select a friend to call");
    return;
  }

  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = stream;

  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  pc.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
  };

  pc.onicecandidate = e => {
    if (e.candidate) {
      ws.send(JSON.stringify({
        type: "ice-candidate",
        to: currentDM,
        candidate: e.candidate
      }));
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({
    type: "call-offer",
    to: currentDM,
    offer
  }));
}

async function handleOffer(data) {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = stream;

  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  pc.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
  };

  await pc.setRemoteDescription(data.offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  ws.send(JSON.stringify({
    type: "call-answer",
    to: data.from,
    answer
  }));
}