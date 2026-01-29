/**
 * client.js
 * 
 * Client-side logic for the Trivia Platform.
 * Handles UI transitions and real-time communication with the server.
 */

const socket = io();

// State management
let myUuid = localStorage.getItem("playerUuid") || Math.random().toString(36).substring(2, 15);
localStorage.setItem("playerUuid", myUuid);

let currentRoom = null;
let isHost = false;
let valueInterval = null;
let currentChoiceIndex = null;
let currentQuestionData = null;

// UI Elements
const joinScreen = document.getElementById("join-screen");
const hostScreen = document.getElementById("host-screen");
const playerScreen = document.getElementById("player-screen");
const questionView = document.getElementById("question-view");

// Naming constants to match server/core/EventTypes.js
const CMDS = {
    CREATE_ROOM: "room:create",
    JOIN_ROOM: "room:join",
    START_GAME: "game:start",
    SUBMIT_ANSWER: "game:submit_answer"
};

const EVTS = {
    ROOM_CREATED: "room:created",
    PLAYER_JOINED: "room:player_joined",
    GAME_STARTED: "game:started",
    PREP_PHASE: "game:prep_phase",
    NEXT_QUESTION: "game:next_question",
    ELIMINATE_OPTION: "game:eliminate_option",
    ANSWER_ACCEPTED: "game:answer_accepted",
    QUESTION_RESULTS: "game:question_results",
    SHOW_SCOREBOARD: "game:show_scoreboard",
    GAME_OVER: "game:over",
    ERROR: "platform:error"
};

/**
 * Transitions from Lobby to Host mode.
 */
function setupHost() {
    isHost = true;
    joinScreen.style.display = "none";
    hostScreen.style.display = "block";
    socket.emit(CMDS.CREATE_ROOM, {});
}

/**
 * Attempts to join a room as a player.
 */
function joinRoom() {
    const name = document.getElementById("player-name").value;
    const code = document.getElementById("room-code-input").value.toUpperCase();

    if (!name || !code) {
        alert("Please enter both your name and a room code.");
        return;
    }

    currentRoom = code;
    socket.emit(CMDS.JOIN_ROOM, {
        roomCode: code,
        player: { uuid: myUuid, name: name, role: "player" }
    });
}

/**
 * Starts the game (Host only).
 */
function startGame() {
    socket.emit(CMDS.START_GAME, { roomCode: currentRoom });
}

// --- Socket Listeners ---

socket.on(EVTS.ROOM_CREATED, (data) => {
    currentRoom = data.roomCode;
    document.getElementById("room-code-display").innerText = currentRoom;
    document.getElementById("start-btn").style.display = "inline-block";
    
    // Host joins the socket room to hear broadcasts
    socket.emit(CMDS.JOIN_ROOM, {
        roomCode: currentRoom,
        player: { uuid: "HOST-" + currentRoom, name: "HOST", role: "host" }
    });
});

socket.on(EVTS.PLAYER_JOINED, (data) => {
    if (data.player.role === "host") return;

    if (isHost) {
        const list = document.getElementById("host-player-list");
        if (!document.getElementById(`player-${data.player.uuid}`)) {
            const li = document.createElement("li");
            li.id = `player-${data.player.uuid}`;
            li.innerText = data.player.name;
            list.appendChild(li);
        }
    } else {
        joinScreen.style.display = "none";
        playerScreen.style.display = "block";
        document.getElementById("player-status").innerText = `IN THE LOBBY AS ${data.player.name}`;
    }
});

socket.on(EVTS.PREP_PHASE, (data) => {
    hostScreen.style.display = "none";
    joinScreen.style.display = "none";
    questionView.style.display = "none";

    if (isHost) {
        const prepView = document.getElementById("prep-view");
        prepView.style.display = "block";
        document.getElementById("prep-question-number").innerText = `QUESTION ${data.questionNumber} OF ${data.totalQuestions}`;
        document.getElementById("prep-category").innerText = data.category;
        
        let timeLeft = data.resultTime;
        const countdownEl = document.getElementById("prep-countdown");
        countdownEl.innerText = timeLeft;
        
        const timer = setInterval(() => {
            timeLeft--;
            countdownEl.innerText = timeLeft;
            if (timeLeft <= 0) clearInterval(timer);
        }, 1000);

        // Render standings
        const list = document.getElementById("scoreboard-list");
        list.innerHTML = "";

        if (data.leaderboard) {
            data.leaderboard.forEach((player, i) => {
                const li = document.createElement("li");
                li.style.padding = "10px";
                li.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
                li.innerHTML = `
                    <span style="float: left;">${i + 1}. ${player.name}</span>
                    <span style="float: right; color: var(--jeopardy-yellow);">${player.score || 0}</span>
                    <div style="clear: both;"></div>
                `;
                list.appendChild(li);
            });
        }
    } else {
        document.getElementById("player-status").innerText = `GET READY FOR QUESTION ${data.questionNumber}!`;
        document.getElementById("player-question-text").style.display = "none";
        document.getElementById("player-options").innerHTML = "";
        document.getElementById("player-potential-score").style.display = "none"; // Hide potential score on prep
        document.getElementById("player-locked-score").style.display = "none";     // Hide locked score on prep
    }
});

socket.on(EVTS.NEXT_QUESTION, (data) => {
    hostScreen.style.display = "none";
    joinScreen.style.display = "none";
    
    currentChoiceIndex = null;
    currentQuestionData = data;

    const buffer = (data.readingBufferTime || 0);
    const total = data.totalTime;
    const startTime = Date.now();
    const base = data.scoring.basePoints;
    const bonus = data.scoring.speedBonusMax;

    if (valueInterval) clearInterval(valueInterval);
    
    valueInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const effectiveElapsed = Math.max(0, elapsed - buffer);
        const timeFactor = (total - effectiveElapsed) / total;
        const liveValue = Math.floor(base + (bonus * Math.max(0, timeFactor)));
        
        if (isHost) {
            const vd = document.getElementById("question-value");
            if (vd) vd.innerText = `WORTH: ${liveValue}`;
        } else { // Display for player
            document.getElementById("player-potential-score").innerText = `POTENTIAL SCORE: +${liveValue}`;
            document.getElementById("player-potential-score").style.display = "block"; // Always show potential score here
        }
        
        if (effectiveElapsed >= total) {
            clearInterval(valueInterval);
            if (isHost) {
                const vd = document.getElementById("question-value");
                if (vd) vd.innerText = "WORTH: 0";
            }
        }
    }, 100);

    if (isHost) {
        document.getElementById("prep-view").style.display = "none";
        questionView.style.display = "block";
        playerScreen.style.display = "none";
        
        document.getElementById("question-category").innerText = data.category;
        document.getElementById("question-text").innerText = data.question;
        
        const hostOptions = document.getElementById("host-options");
        hostOptions.innerHTML = "";
        data.options.forEach((opt, i) => {
            const div = document.createElement("div");
            div.className = "option-btn";
            div.id = `host-opt-${i}`;
            div.innerText = opt;
            hostOptions.appendChild(div);
        });

        const bar = document.getElementById("timer-progress");
        bar.style.transition = "none";
        bar.style.width = "100%";
        
        // Wait for reading buffer before starting transition
        setTimeout(() => {
            bar.style.transition = `width ${data.totalTime}s linear`;
            bar.style.width = "0%";
        }, buffer * 1000);
    } else {
        questionView.style.display = "none";
        playerScreen.style.display = "block";
        // Ensure potential is visible and locked is hidden
        document.getElementById("player-potential-score").innerText = ""; // Clear any previous value
        document.getElementById("player-potential-score").style.display = "block"; 
        document.getElementById("player-locked-score").style.display = "none";

        document.getElementById("player-status").innerText = "CHOOSE THE CORRECT ANSWER!";
        const qText = document.getElementById("player-question-text");
        qText.innerText = data.question;
        qText.style.display = "block";

        const playerOptions = document.getElementById("player-options");
        playerOptions.innerHTML = "";
        
        data.options.forEach((opt, i) => {
            const btn = document.createElement("button");
            btn.className = "option-btn";
            btn.id = `player-opt-${i}`;
            btn.innerText = opt;
            btn.disabled = false;
            btn.onclick = () => {
                currentChoiceIndex = i;
                btn.classList.add("selected");
                document.querySelectorAll("#player-options button").forEach(b => b.disabled = true);
                socket.emit(CMDS.SUBMIT_ANSWER, {
                    roomCode: currentRoom,
                    playerUuid: myUuid,
                    answerIndex: i
                });
                document.getElementById("player-status").innerText = "ANSWER LOCKED IN!";
            };
            playerOptions.appendChild(btn);
        });
    }
});

socket.on(EVTS.ELIMINATE_OPTION, (data) => {
    const hostOpt = document.getElementById(`host-opt-${data.optionIndex}`);
    if (hostOpt) hostOpt.classList.add("eliminated");

    const playerOpt = document.getElementById(`player-opt-${data.optionIndex}`);
    if (playerOpt) {
        playerOpt.classList.add("eliminated");
        playerOpt.disabled = true;
    }
});

socket.on(EVTS.ANSWER_ACCEPTED, (data) => {
    if (!isHost && data.playerUuid === myUuid) {
        // Update the locked score with the server-confirmed potential score
        document.getElementById("player-locked-score").innerText = `LOCKED FOR: +${data.points}`;
        document.getElementById("player-locked-score").style.display = "block";
    }
});

socket.on(EVTS.QUESTION_RESULTS, (data) => {
    if (valueInterval) clearInterval(valueInterval);
    if (isHost) {
        const correctOpt = document.getElementById(`host-opt-${data.correctIndex}`);
        if (correctOpt) {
            correctOpt.classList.add("correct");
        }
    } else {
        // DEBUG: Log received data
        console.log("EVTS.QUESTION_RESULTS received:", data);
        console.log("myUuid:", myUuid);

        document.getElementById("player-potential-score").style.display = "none"; // Hide potential score

        // Highlight correct and incorrect on player screen
        if (currentChoiceIndex !== null) {
            const selectedBtn = document.getElementById(`player-opt-${currentChoiceIndex}`);
            if (selectedBtn) {
                if (currentChoiceIndex === data.correctIndex) {
                    selectedBtn.classList.remove("selected");
                    selectedBtn.classList.add("correct");
                    document.getElementById("player-status").innerText = "CORRECT!";
                } else {
                    selectedBtn.classList.remove("selected");
                    selectedBtn.classList.add("incorrect");
                    document.getElementById("player-status").innerText = "INCORRECT!";
                }
            }
        } else {
            document.getElementById("player-status").innerText = "TIME IS UP!";
        }

        const correctBtn = document.getElementById(`player-opt-${data.correctIndex}`);
        if (correctBtn) {
            correctBtn.classList.add("correct");
        }
        
        document.querySelectorAll("#player-options button").forEach(b => b.disabled = true);

        // Display actual score for the round
        if (data.playerScoresThisRound && data.playerScoresThisRound[myUuid] !== undefined) {
            document.getElementById("player-locked-score").innerText = `SCORE: +${data.playerScoresThisRound[myUuid]}`;
            document.getElementById("player-locked-score").style.display = "block"; // Keep locked score visible, but update text
        } else {
            // If for some reason playerScoresThisRound[myUuid] is not available, default to 0
            console.log("Player score is missing.")
            document.getElementById("player-locked-score").innerText = "SCORE: +0";
            document.getElementById("player-locked-score").style.display = "block"; // Ensure it's visible
        }
    }
});

socket.on(EVTS.SHOW_SCOREBOARD, (data) => {
    // Deprecated in favor of merged Prep phase
});

socket.on(EVTS.ERROR, (data) => {
    alert(data.message);
});
