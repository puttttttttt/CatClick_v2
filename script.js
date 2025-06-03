// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firebase Config
const firebaseConfigJson = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
const firebaseConfig = JSON.parse(firebaseConfigJson);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-catclicker-app-v2'; 

// Initialize Firebase
let app;
let auth;
let db;
let userId;
let isAuthReady = false;
let scoresUnsubscribe = null;

if (Object.keys(firebaseConfig).length > 0) {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        console.log("Firebase initialized successfully for Cat Clicker V2.");
    } catch (error) {
        console.error("Firebase initialization error:", error);
        db = null; auth = null;
    }
} else {
    console.warn("Firebase config is not available. Game will run without Firebase persistence.");
    db = null; auth = null;
}

// Element References
const canvas                = document.getElementById('gameCanvas');
const ctx                   = canvas.getContext('2d');
const bgMusic               = document.getElementById('bgMusic');
const collectSound          = document.getElementById('collectSound');
const clickSound            = document.getElementById('clickSound');
const cheerSound            = document.getElementById('cheerSound');
const menuOverlay           = document.getElementById('menuOverlay');
const gameOverOverlay       = document.getElementById('gameOverOverlay');
const startBtn              = document.getElementById('startBtn');
const stopBtn               = document.getElementById('stopBtn');
const replayBtn             = document.getElementById('replayBtn');
const exitBtn               = document.getElementById('exitBtn');
const menuHighScore         = document.getElementById('menuHighScore');
const menuLatestScoresList  = document.getElementById('menuLatestScoresList');
const finalScoreSpan        = document.getElementById('finalScore');
const goHighScore           = document.getElementById('goHighScore');
const goLatestScoresList    = document.getElementById('goLatestScoresList');
const userIdDisplay         = document.getElementById('userIdDisplay');

// Game State
let gameState      = 'menu';
let score          = 0; 
let highScore      = 0;
let pastScores     = [];
let targets        = []; 
let confetti       = [];
let lastSpawnTime  = 0;
let spawnInterval  = 1200; 
let countdownStart = 0;
let isNewHigh      = false;
const RAT_BROWN_COLOR = "#8B7355"; 
const RAT_SMACKED_COLOR = "rgba(255, 0, 0, 0.7)"; 

// Canvas Resizing
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

// Persistence with Firestore
async function loadScores() {
  if (!db || !userId) {
    console.log("Firestore not available or user not auth. Using local scores for Cat Clicker.");
    highScore = parseInt(localStorage.getItem(appId + '_highScore') || '0', 10);
    pastScores = JSON.parse(localStorage.getItem(appId + '_pastScores') || '[]');
    updateMenu();
    return;
  }
  const scoresDocRef = doc(db, 'artifacts', appId, 'users', userId, 'catclicker_data', 'scores');
  if (scoresUnsubscribe) scoresUnsubscribe();
  scoresUnsubscribe = onSnapshot(scoresDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      highScore = data.highScore || 0;
      pastScores = data.pastScores || [];
    } else {
      highScore = 0; pastScores = [];
      saveScores(); 
    }
    if (gameState === 'menu') updateMenu();
  }, (error) => {
    console.error("Error listening to score updates:", error);
    highScore = parseInt(localStorage.getItem(appId + '_highScore') || '0', 10);
    pastScores = JSON.parse(localStorage.getItem(appId + '_pastScores') || '[]');
    if (gameState === 'menu') updateMenu();
  });
}

async function saveScores() {
  if (!db || !userId) {
    localStorage.setItem(appId + '_highScore', highScore.toString());
    localStorage.setItem(appId + '_pastScores', JSON.stringify(pastScores));
    return;
  }
  const scoresDocRef = doc(db, 'artifacts', appId, 'users', userId, 'catclicker_data', 'scores');
  try {
    await setDoc(scoresDocRef, { highScore, pastScores }, { merge: true });
  } catch (error) {
    console.error("Error saving scores to Firestore:", error);
    localStorage.setItem(appId + '_highScore', highScore.toString());
    localStorage.setItem(appId + '_pastScores', JSON.stringify(pastScores));
  }
}

// List Populator
function populateList(ulElement, scoresArray) {
  if (!ulElement) return;
  ulElement.innerHTML = '';
  scoresArray.slice(-5).reverse().forEach(s => {
    const li = document.createElement('li');
    li.textContent = s;
    li.className = 'py-1 text-purple-100'; // Match text color
    ulElement.appendChild(li);
  });
}

// Menu & Overlays
function updateMenu() {
  if(menuHighScore) menuHighScore.textContent = highScore;
  if(menuLatestScoresList) populateList(menuLatestScoresList, pastScores);
}

function showMenu() {
  gameState = 'menu';
  if(menuOverlay) menuOverlay.classList.remove('hidden');
  if(gameOverOverlay) gameOverOverlay.classList.add('hidden');
  if(stopBtn) stopBtn.classList.add('hidden');
  if(bgMusic && !bgMusic.paused) {
      bgMusic.pause(); 
      bgMusic.currentTime = 0;
  }
  updateMenu();
}

// Start & End Game
function startGame() {
  if (clickSound && clickSound.readyState >= 2) clickSound.play().catch(e => console.warn("Button click sound play error:", e));
  if(menuOverlay) menuOverlay.classList.add('hidden');
  if(gameOverOverlay) gameOverOverlay.classList.add('hidden');
  if(stopBtn) stopBtn.classList.remove('hidden');
  
  targets   = [];
  confetti  = [];
  score     = 0;
  isNewHigh = false;
  countdownStart = performance.now();
  gameState = 'countdown';
  
  if (bgMusic && bgMusic.readyState >= 2) {
    bgMusic.currentTime = 0;
    bgMusic.play().catch(e => console.warn("BG music play error:", e));
  } else if (bgMusic) {
    console.warn("BG music not ready to play.");
  }
}

function endGame() {
  gameState = 'gameover';
  if(stopBtn) stopBtn.classList.add('hidden');
  if(bgMusic) bgMusic.pause();
  
  if (cheerSound && cheerSound.readyState >=2) {
    cheerSound.currentTime = 0;
    cheerSound.play().catch(e => console.warn("Cheer sound play error:", e));
  } else if (cheerSound) {
    console.warn("Cheer sound not ready to play.");
  }

  pastScores.push(score);
  if (pastScores.length > 5) pastScores = pastScores.slice(-5);
  if (score > highScore) { highScore = score; isNewHigh = true; }
  saveScores();

  if(finalScoreSpan) finalScoreSpan.textContent = score;
  if(goHighScore) goHighScore.textContent = highScore;
  if(goLatestScoresList) populateList(goLatestScoresList, pastScores);
  if(gameOverOverlay) gameOverOverlay.classList.remove('hidden');
  if (isNewHigh) spawnConfetti();
}

function drawRat(x, y, size, direction, state, appearanceTime, timestamp, wiggleOffset, smackDetails) {
    const bodyWidth = size;
    const bodyHeight = size * 0.6;
    const earRadius = size * 0.15;
    const tailLength = size * 0.7;
    const eyeRadius = size * 0.05;

    let scale = 1;
    const appearDuration = 300; 
    if (timestamp - appearanceTime < appearDuration) {
        scale = Math.min(1, (timestamp - appearanceTime) / appearDuration); 
    }
    
    const currentBodyWidth = bodyWidth * scale;
    const currentBodyHeight = bodyHeight * scale;
    const currentEarRadius = earRadius * scale;
    const currentTailLength = tailLength * scale;
    const currentEyeRadius = eyeRadius * scale;

    if (scale < 0.1) return; 

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(direction); 

    if (state !== 'smacked') {
        ctx.rotate(wiggleOffset);
    }

    let bodyFillColor = RAT_BROWN_COLOR;

    if (state === 'smacked' && smackDetails) { 
        const smackProgress = Math.min(1, (timestamp - smackDetails.time) / smackDetails.duration);
        if (Math.floor(smackProgress * 10) % 2 === 0) { 
             bodyFillColor = RAT_SMACKED_COLOR;
        } else {
             bodyFillColor = RAT_BROWN_COLOR; 
        }
    }
    
    // Tail
    ctx.beginPath();
    ctx.moveTo(-currentBodyWidth / 2.5, currentBodyHeight * 0.1); 
    ctx.quadraticCurveTo(-currentBodyWidth / 2 - currentTailLength * 0.8, currentBodyHeight * 0.3, -currentBodyWidth / 2 - currentTailLength, currentBodyHeight * 0.1);
    ctx.strokeStyle = "#756658"; 
    ctx.lineWidth = Math.max(1, 4 * scale);
    ctx.stroke();

    // Body
    ctx.fillStyle = bodyFillColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, currentBodyWidth / 2, currentBodyHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = "#D2B48C"; 
    ctx.beginPath();
    ctx.arc(currentBodyWidth / 3.5, -currentBodyHeight / 2.8, currentEarRadius, 0, Math.PI * 2); 
    ctx.fill();
    ctx.beginPath();
    ctx.arc(currentBodyWidth / 3.5, currentBodyHeight / 2.8, currentEarRadius, 0, Math.PI * 2); 
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(currentBodyWidth / 2.8, -currentBodyHeight / 5, currentEyeRadius, 0, Math.PI * 2); 
    ctx.fill();
    ctx.beginPath();
    ctx.arc(currentBodyWidth / 2.8, currentBodyHeight / 5, currentEyeRadius, 0, Math.PI * 2); 
    ctx.fill();

    // Nose
    ctx.fillStyle = "#FFC0CB"; 
    ctx.beginPath();
    ctx.arc(currentBodyWidth / 2 + currentBodyWidth * 0.03, 0, currentBodyWidth * 0.06 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

function spawnRat() {
  const baseSize = Math.min(canvas.width, canvas.height) / 9; 
  const size = baseSize * (0.8 + Math.random() * 0.4); 
  const direction = Math.random() < 0.5 ? 0 : Math.PI; 

  targets.push({
    id: crypto.randomUUID(),
    x:    size/2 + Math.random() * (canvas.width - size), 
    y:    size/2 + Math.random() * (canvas.height - size),
    size,
    direction, 
    appearanceTime: performance.now(),
    life: 1800 + Math.random() * 1500, 
    state: 'appearing', 
    smackDetails: null, 
    wiggleSeed: Math.random() * 100 
  });
}

function spawnConfetti() {
  confetti = [];
  for (let i = 0; i < 150; i++) {
    confetti.push({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height,
      vx: -3 + Math.random() * 6, vy: 3 + Math.random() * 4,
      size: 5 + Math.random() * 5, color: `hsl(${Math.random()*360}, 100%, 65%)`,
      angle: Math.random() * Math.PI * 2, spin: -0.1 + Math.random() * 0.2
    });
  }
}

function handlePointer(eventX, eventY) {
  if (gameState !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  const x = eventX - rect.left;
  const y = eventY - rect.top;

  for (let i = targets.length - 1; i >= 0; i--) {
    const rat = targets[i];
    if (rat.state === 'smacked') continue;

    const dx = x - rat.x;
    const dy = y - rat.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < rat.size / 1.8) { 
      if (collectSound && collectSound.readyState >= 2) { // Rat tapped sound
        collectSound.currentTime = 0;
        collectSound.play().catch(e => console.warn("Collect sound (rat tap) play error:", e));
      } else if (collectSound) {
        console.warn("Collect sound not ready to play.");
      }
      score++;
      rat.state = 'smacked';
      rat.smackDetails = { time: performance.now(), duration: 400 }; 
      spawnInterval = Math.max(200, spawnInterval * 0.98); 
      break; 
    }
  }
}
canvas.addEventListener('click', e => {
    // Play button click sound for canvas clicks only if it's not a rat hit
    // This might be too broad, consider if only UI buttons should trigger this.
    // For now, any click on canvas that isn't a rat hit could play it.
    // if (clickSound && clickSound.readyState >= 2 && gameState === 'playing') {
    //    clickSound.play().catch(e => console.warn("General canvas click sound play error:", e));
    // }
    handlePointer(e.clientX, e.clientY)
});
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length > 0) {
    // Similar logic for touch if desired for general canvas tap sound
    handlePointer(e.touches[0].clientX, e.touches[0].clientY);
  }
});

// Generic button click sound function
function playButtonSound() {
    if (clickSound && clickSound.readyState >= 2) {
        clickSound.currentTime = 0;
        clickSound.play().catch(e => console.warn("Button click sound play error:", e));
    } else if (clickSound) {
        console.warn("Click sound not ready for button.");
    }
}

// Apply generic click sound to UI buttons
if(stopBtn) stopBtn.addEventListener('click', () => {
  playButtonSound();
  if (gameState === 'playing' || gameState === 'countdown') endGame();
});
if(startBtn) startBtn.addEventListener('click', () => {
    playButtonSound();
    startGame();
});
if(replayBtn) replayBtn.addEventListener('click', () => {
    playButtonSound();
    startGame();
});
if(exitBtn) exitBtn.addEventListener('click', () => {
  playButtonSound();
  showMenu();
});

function gameLoop(timestamp) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (gameState === 'countdown') {
    const elapsed = timestamp - countdownStart;
    const count = 3 - Math.floor(elapsed / 1000);
    if (count > 0) {
      ctx.fillStyle = '#FFF';
      ctx.font = `bold ${Math.min(150, canvas.width / 5)}px Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(count, canvas.width/2, canvas.height/2);
    } else {
      gameState = 'playing';
      lastSpawnTime = timestamp;
      spawnInterval = 1000 + Math.random() * 1000;
    }
  }

  if (gameState === 'playing') {
    if (timestamp - lastSpawnTime > spawnInterval) {
      spawnRat();
      lastSpawnTime  = timestamp;
      spawnInterval = Math.max(250, (600 + Math.random()*1200) * (1 - score * 0.003)); 
    }

    for (let i = targets.length - 1; i >= 0; i--) {
        const rat = targets[i];
        let wiggleOffset = 0;
        if (rat.state !== 'smacked') {
            wiggleOffset = Math.sin(timestamp / 200 + rat.wiggleSeed) * 0.1; 
        }
        
        if (rat.state === 'smacked') {
            if (rat.smackDetails && timestamp - rat.smackDetails.time > rat.smackDetails.duration) {
                targets.splice(i, 1); 
                continue;
            }
            drawRat(rat.x, rat.y, rat.size, rat.direction, rat.state, rat.appearanceTime, timestamp, wiggleOffset, rat.smackDetails);
        } else {
            if (timestamp - rat.appearanceTime > rat.life && rat.state !== 'smacked') {
                targets.splice(i, 1); 
                continue;
            }
            if (rat.state === 'appearing' && timestamp - rat.appearanceTime >= 300) { // appearDuration
                rat.state = 'normal';
            }
            drawRat(rat.x, rat.y, rat.size, rat.direction, rat.state, rat.appearanceTime, timestamp, wiggleOffset, rat.smackDetails);
        }
    }
    
    ctx.fillStyle = '#FFD700'; 
    ctx.font = `${Math.min(30, canvas.width / 25)}px Inter, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`Smacks: ${score}`, 20, 20);
    ctx.fillText(`Top: ${highScore}`, 20, 20 + parseInt(ctx.font) + 5);
  }

  if (gameState === 'gameover' && isNewHigh && confetti.length > 0) {
    confetti.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x + p.size / 2, p.y + p.size / 2);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      ctx.restore();
    });
    confetti = confetti.filter(p => p.y < canvas.height + 50 && p.x > -50 && p.x < canvas.width + 50);
    if (confetti.length === 0) isNewHigh = false;
  }

  requestAnimationFrame(gameLoop);
}

function initializeGame() {
    resizeCanvas(); // Initial resize
    if (auth) {
        onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                userId = currentUser.uid;
            } else {
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token); return; 
                    } else {
                        await signInAnonymously(auth); return;
                    }
                } catch (error) {
                    console.error("Error during sign-in:", error);
                    userId = `localUser_${crypto.randomUUID()}`;
                }
            }
            if(userIdDisplay && userId) userIdDisplay.textContent = userId;
            isAuthReady = true;
            await loadScores();
            showMenu();
            requestAnimationFrame(gameLoop);
        }, (error) => {
            console.error("Auth state error:", error);
            userId = `localUser_${crypto.randomUUID()}`;
            if(userIdDisplay && userId) userIdDisplay.textContent = userId + " (Local Fallback)";
            isAuthReady = true; loadScores(); showMenu(); requestAnimationFrame(gameLoop);
        });
    } else {
        console.warn("Firebase not available. Running Cat Clicker V2 in local mode.");
        userId = `localUser_${crypto.randomUUID()}`;
        if(userIdDisplay && userId) userIdDisplay.textContent = userId + " (Local Mode)";
        isAuthReady = true; loadScores(); showMenu(); requestAnimationFrame(gameLoop);
    }
}

initializeGame();
