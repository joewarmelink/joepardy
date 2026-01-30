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

// --- Local Storage Helper Functions ---
function clearGameLocalStorage() {
    localStorage.removeItem("playerRoomCode");
    localStorage.removeItem("playerUuid");
    localStorage.removeItem("playerName");
    localStorage.removeItem("playerRole");
    localStorage.removeItem("hostRoomCode");
    localStorage.removeItem("hostUuid");
    localStorage.removeItem("hostRole");
}

function setPlayerLocalStorage(roomCode, uuid, name, role) {
    clearGameLocalStorage(); // Clear host data when setting player data
    localStorage.setItem("playerRoomCode", roomCode);
    localStorage.setItem("playerUuid", uuid);
    localStorage.setItem("playerName", name);
    localStorage.setItem("playerRole", role);
}

function setHostLocalStorage(roomCode, uuid, role) {
    clearGameLocalStorage(); // Clear player data when setting host data
    localStorage.setItem("hostRoomCode", roomCode);
    localStorage.setItem("hostUuid", uuid);
    localStorage.setItem("hostRole", role);
}
// --- End Local Storage Helper Functions ---
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
const summaryScreen = document.getElementById("summary-screen");
const prepView = document.getElementById("prep-view");

// Utility function to manage screen transitions
function showScreen(screenElement) {
    const allScreens = [
        joinScreen,
        hostScreen,
        playerScreen,
        questionView,
        summaryScreen,
        prepView
    ];

    allScreens.forEach(screen => {
        if (screen && screen !== screenElement) {
            screen.style.display = "none";
        }
    });

    if (screenElement) {
        screenElement.style.display = "block";
    }
}

/**
 * Starts a countdown timer that updates a display element.
 * @param {HTMLElement} displayElement - The DOM element to update with the countdown.
 * @param {number} initialTime - The starting time for the countdown in seconds.
 * @param {Function} [onFinishCallback] - Optional callback function to execute when the countdown finishes.
 * @returns {number} The interval ID, which can be used to clear the timer if needed.
 */
function startCountdown(displayElement, initialTime, onFinishCallback = () => {}) {
    let timeLeft = initialTime;
    // Update immediately to show initial time
    displayElement.innerText = timeLeft;

    const timerId = setInterval(() => {
        timeLeft--;
        displayElement.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timerId);
            onFinishCallback();
        }
    }, 1000);

    return timerId;
}

/**
 * Generates and appends option buttons/divs for a question,
 * handling both host and player specific attributes.
 * @param {Array<string>} options - An array of answer option strings.
 * @param {string} parentElementId - The ID of the HTML element to append options to.
 * @param {boolean} isPlayer - True if rendering for a player, false for a host.
 * @param {Function} [onClickHandler=null] - Optional click handler for player buttons, receives index.
 */
function renderOptionButtons(options, parentElementId, isPlayer, onClickHandler = null) {
    const parentElement = document.getElementById(parentElementId);
    if (!parentElement) {
        console.error(`Parent element with ID "${parentElementId}" not found.`);
        return;
    }

    parentElement.innerHTML = ""; // Clear existing options

    options.forEach((opt, i) => {
        const element = document.createElement(isPlayer ? "button" : "div");
        element.className = "option-btn";
        element.id = `${isPlayer ? "player" : "host"}-opt-${i}`;
        element.innerText = opt;

        if (isPlayer) {
            element.disabled = false;
            if (onClickHandler) {
                element.onclick = () => onClickHandler(i);
            }
        }
        parentElement.appendChild(element);
    });
}

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
    SHOW_SUMMARY: "game:show_summary",
    RETURN_TO_LOBBY: "game:return_to_lobby",
    ERROR: "platform:error",
    RECONNECT_SUCCESS: "reconnect:success"
};

/**
 * Renders the scoreboard (header and player entries) into a specified list element.
 * @param {Array} leaderboardData - An array of player objects with score information.
 * @param {string} listElementId - The ID of the UL element to render the scoreboard into.
 */
/**
 * Renders the host-specific UI for the Prep Phase.
 * @param {object} gameData - The game data for the current phase.
 * @param {Array} playersData - An array of player objects for the scoreboard.
 */
function renderHostPrepPhaseUI(gameData, playersData) {
    showScreen(prepView);

    document.getElementById("prep-question-number").innerText = `QUESTION ${gameData.currentQuestionIndex + 1} OF ${gameData.totalQuestions}`;
    // Assuming category might be directly in gameData during reconnect, or needs to be derived.
    // For now, let's assume it's available in gameData if a question has been loaded.
    // If not, it might appear blank or need adjustment.
    document.getElementById("prep-category").innerText = gameData.category || "CATEGORY UNKNOWN"; // Fallback for safety

    const countdownEl = document.getElementById("prep-countdown");
    startCountdown(countdownEl, gameData.resultTime);

    renderScoreboard(playersData, "scoreboard-list");
}

/**
 * Renders the player-specific UI for the Prep Phase.
 * @param {object} gameData - The game data for the current phase.
 * @param {Array} playersData - An array of player objects (or leaderboard) to find the current player's score.
 * @param {string} myPlayerUuid - The UUID of the current player.
 */
function renderPlayerPrepPhaseUI(gameData, playersData, myPlayerUuid) {
    document.getElementById("player-status").innerText = `GET READY FOR QUESTION ${gameData.currentQuestionIndex + 1}!`;
    document.getElementById("player-question-text").style.display = "none";
    document.getElementById("player-options").innerHTML = "";
    document.getElementById("player-potential-score").style.display = "none"; // Hide potential score on prep

    // Find current player's score from playersData (which can be `leaderboard` or `data.players`)
    const currentPlayer = playersData.find(p => p.uuid === myPlayerUuid);
    const playerScore = currentPlayer ? currentPlayer.score || 0 : 0;

    document.getElementById("player-locked-score").innerText = `SCORE: ${playerScore}`;
    document.getElementById("player-locked-score").style.display = "block"; // Always show current score
}

function renderScoreboard(leaderboardData, listElementId) {
    const list = document.getElementById(listElementId);
    list.innerHTML = "";

    if (leaderboardData) {
        // Add a header row for the scoreboard
        const headerLi = document.createElement("li");
        headerLi.style.padding = "10px";
        headerLi.style.fontWeight = "bold";
        headerLi.innerHTML = `
            <span style="float: left;">Player</span>
            <span style="float: right; width: 150px; text-align: right;">Total Score</span>
            <span style="float: right; width: 100px; text-align: right;">Round Score</span>
            <div style="clear: both;"></div>
        `;
        list.appendChild(headerLi);

        leaderboardData.forEach((player, i) => {
            const li = document.createElement("li");
            li.style.padding = "10px";
            li.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
            li.innerHTML = `
                <span style="float: left;">${i + 1}. ${player.name}</span>
                <span style="float: right; width: 150px; text-align: right; color: var(--jeopardy-yellow);">${player.score || 0}</span>
                <span style="float: right; width: 100px; text-align: right; color: var(--jeopardy-blue);">${player.currentRoundScore || 0}</span>
                <div style="clear: both;"></div>
            `;
            list.appendChild(li);
        });
    }
}

/**
 * Transitions from Lobby to Host mode.
 */
function setupHost() {

    isHost = true;
    showScreen(hostScreen);
    // Clear any previous auto-rejoin state before a manual host setup
    clearGameLocalStorage();
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
    // Clear any previous auto-rejoin state before a manual join
    clearGameLocalStorage();
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

    setHostLocalStorage(data.roomCode, "HOST-" + currentRoom, "host");
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
        showScreen(playerScreen);
        document.getElementById("player-status").innerText = `IN THE LOBBY AS ${data.player.name}`;

        setPlayerLocalStorage(data.roomCode, data.player.uuid, data.player.name, data.player.role);
    }
});

socket.on(EVTS.PREP_PHASE, (data) => {
    if (isHost) {
        renderHostPrepPhaseUI(data, data.leaderboard);
    } else {
        renderPlayerPrepPhaseUI(data, data.leaderboard, myUuid);
    }
});

socket.on(EVTS.NEXT_QUESTION, (data) => {
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
        showScreen(questionView);

        
        document.getElementById("question-category").innerText = data.category;
        document.getElementById("question-text").innerText = data.question;
        
        renderOptionButtons(data.options, "host-options", false);

        const bar = document.getElementById("timer-progress");
        bar.style.transition = "none";
        bar.style.width = "100%";
        
        // Wait for reading buffer before starting transition
        setTimeout(() => {
            bar.style.transition = `width ${data.totalTime}s linear`;
            bar.style.width = "0%";
        }, buffer * 1000);
    } else {
        showScreen(playerScreen);
        // Ensure potential is visible and locked is hidden
        document.getElementById("player-potential-score").innerText = ""; // Clear any previous value
        document.getElementById("player-potential-score").style.display = "block"; 
        document.getElementById("player-locked-score").style.display = "none";

        document.getElementById("player-status").innerText = "CHOOSE THE CORRECT ANSWER!";
        const qText = document.getElementById("player-question-text");
        qText.innerText = data.question;
        qText.style.display = "block";

        renderOptionButtons(data.options, "player-options", true, (index) => {
            currentChoiceIndex = index;
            const selectedBtn = document.getElementById(`player-opt-${index}`);
            if (selectedBtn) {
                selectedBtn.classList.add("selected");
            }
            document.querySelectorAll("#player-options button").forEach(b => b.disabled = true);
            socket.emit(CMDS.SUBMIT_ANSWER, {
                roomCode: currentRoom,
                playerUuid: myUuid,
                answerIndex: index
            });
            document.getElementById("player-status").innerText = "ANSWER LOCKED IN!";
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
            document.getElementById("player-locked-score").style.display = "block"; // Ensure it\`s visible
        }
    }
});

socket.on(EVTS.SHOW_SCOREBOARD, (data) => {
    // Deprecated in favor of merged Prep phase
});

socket.on(EVTS.GAME_OVER, (data) => {
    // Clear all game-related localStorage on game over
    clearGameLocalStorage();
});

socket.on(EVTS.SHOW_SUMMARY, (data) => {
    console.log(`[Client] EVT_SHOW_SUMMARY received. Data:`, data);
    showScreen(summaryScreen);

    renderScoreboard(data.leaderboard, "final-scoreboard-list");

    const countdownEl = document.getElementById("summary-countdown");
    countdownEl.innerText = `Return to lobby in ${data.summaryScreenTime}...`; // Set initial text
    startCountdown(countdownEl, data.summaryScreenTime, () => {
        // Optional callback if needed after summary countdown finishes
        console.log("Summary countdown finished.");
    });
});

socket.on(EVTS.RETURN_TO_LOBBY, (data) => {
    console.log(`[Client] EVT_RETURN_TO_LOBBY received. Data:`, data);
    showScreen(joinScreen);
});

socket.on(EVTS.RECONNECT_SUCCESS, (data) => {
    console.log("EVT_RECONNECT_SUCCESS received:", data);
    currentRoom = data.roomCode;
    isHost = (data.player.role === "host");
    myUuid = data.player.uuid; // Ensure myUuid is correct on reconnect

    // Hide all screens initially
    showScreen(null);

    if (isHost) {
        showScreen(hostScreen);
        document.getElementById("room-code-display").innerText = currentRoom;
        document.getElementById("start-btn").style.display = "inline-block"; // Assume start button visible on reconnect for host

        const list = document.getElementById("host-player-list");
        list.innerHTML = ""; // Clear existing list
        data.players.filter(p => p.role !== "host").forEach(player => {
            const li = document.createElement("li");
            li.id = `player-${player.uuid}`;
            li.innerText = player.name;
            list.appendChild(li);
        });

        // Host specific UI based on gameData.currentPhase
        if (data.gameData.currentPhase === "GAME_STARTED" || data.gameData.currentPhase === "LOBBY") {
            // Host is in lobby or game just started, show lobby view
            // This part might need more granular control later
        } else if (data.gameData.currentPhase === "PREP_OR_RESULTS") {
            renderHostPrepPhaseUI(data.gameData, data.players);

        } else if (data.gameData.currentPhase === "QUESTION_ACTIVE") {
            // Host reconnected during an active question
            showScreen(questionView);
            document.getElementById("question-category").innerText = data.gameData.currentQuestionData.category;
            document.getElementById("question-text").innerText = data.gameData.currentQuestionData.question;
            const hostOptions = document.getElementById("host-options");
            hostOptions.innerHTML = "";
            data.gameData.currentQuestionData.options.forEach((opt, i) => {
                const div = document.createElement("div");
                div.className = "option-btn";
                div.id = `host-opt-${i}`;
                div.innerText = opt;
                hostOptions.appendChild(div);
            });
            // Re-initialize timer visual based on gameConfig.totalTime and elapsed time
            // This would require more sophisticated client-side timer sync with server.
        }

    } else { // Player reconnecting
        showScreen(playerScreen);
        document.getElementById("player-status").innerText = `RECONNECTED AS ${data.player.name}`;

        // Player specific UI based on gameData.currentPhase
        if (data.gameData.currentPhase === "GAME_STARTED" || data.gameData.currentPhase === "LOBBY") {
            // Player is in lobby or game just started
            document.getElementById("player-question-text").style.display = "none";
            document.getElementById("player-options").innerHTML = "";
            document.getElementById("player-potential-score").style.display = "none";
            document.getElementById("player-locked-score").innerText = `SCORE: ${data.player.score || 0}`;
            document.getElementById("player-locked-score").style.display = "block";
        } else if (data.gameData.currentPhase === "PREP_OR_RESULTS") {
            renderPlayerPrepPhaseUI(data.gameData, data.players, myUuid);
        } else if (data.gameData.currentPhase === "QUESTION_ACTIVE") {
            // Player reconnected during an active question
            document.getElementById("player-question-text").innerText = data.gameData.currentQuestionData.question;
            document.getElementById("player-question-text").style.display = "block";
            const playerOptions = document.getElementById("player-options");
            playerOptions.innerHTML = "";
            data.gameData.currentQuestionData.options.forEach((opt, i) => {
                const btn = document.createElement("button");
                btn.className = "option-btn";
                btn.id = `player-opt-${i}`;
                btn.innerText = opt;
                btn.disabled = false;
                // Re-enable click listener with existing answer logic
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
            document.getElementById("player-potential-score").style.display = "block"; // Show potential score
            document.getElementById("player-locked-score").innerText = `SCORE: ${data.player.score || 0}`;
            document.getElementById("player-locked-score").style.display = "block";

            // Re-initialize the potential score interval for the player
            if (valueInterval) clearInterval(valueInterval);
            const reconnectTime = Date.now();
            const initialElapsedTime = (reconnectTime - data.gameData.questionStartTime) / 1000;
            const buffer = (data.gameData.gameConfig.readingBufferTime || 0);
            const total = data.gameData.gameConfig.timeToAnswer;
            const base = data.gameData.gameConfig.scoring.basePoints;
            const bonus = data.gameData.gameConfig.scoring.speedBonusMax;

            valueInterval = setInterval(() => {
                const elapsed = (Date.now() - reconnectTime) / 1000 + initialElapsedTime; // Add initial elapsed time
                const effectiveElapsed = Math.max(0, elapsed - buffer);
                const timeFactor = (total - effectiveElapsed) / total;
                const liveValue = Math.floor(base + (bonus * Math.max(0, timeFactor)));
                
                document.getElementById("player-potential-score").innerText = `POTENTIAL SCORE: +${liveValue}`;
                
                if (effectiveElapsed >= total) {
                    clearInterval(valueInterval);
                    document.getElementById("player-potential-score").innerText = "POTENTIAL SCORE: +0";
                }
            }, 100);
        }
    }
});

// Auto-rejoin logic on socket connect
socket.on("connect", () => {
    const playerRoomCode = localStorage.getItem("playerRoomCode");
    const playerUuid = localStorage.getItem("playerUuid");
    const playerName = localStorage.getItem("playerName");
    const playerRole = localStorage.getItem("playerRole");

    const hostRoomCode = localStorage.getItem("hostRoomCode");
    const hostUuid = localStorage.getItem("hostUuid");
    const hostRole = localStorage.getItem("hostRole");

    if (playerRoomCode && playerUuid && playerName && playerRole) {
        console.log("Attempting to rejoin as player...");
        isHost = false;
        currentRoom = playerRoomCode;
        socket.emit(CMDS.JOIN_ROOM, {
            roomCode: playerRoomCode,
            player: { uuid: playerUuid, name: playerName, role: playerRole }
        });
    } else if (hostRoomCode && hostUuid && hostRole) {
        console.log("Attempting to rejoin as host...");
        isHost = true;
        currentRoom = hostRoomCode;
        socket.emit(CMDS.JOIN_ROOM, {
            roomCode: hostRoomCode,
            player: { uuid: hostUuid, name: "HOST", role: hostRole }
        });
    } else {
        console.log("No saved game state found. Showing join screen.");
        showScreen(joinScreen);
    }
});

socket.onAny((event, ...args) => {
    console.log(`[Client] Received event: ${event}`, args);
});

socket.on(EVTS.ERROR, (data) => {
    console.error("Server Error:", data.message);
    // Optionally, if the error is a "Room not found" during auto-reconnect,
    // we might want to clear localStorage to prevent repeated attempts.
    if (data.message === "Room not found") {
        clearGameLocalStorage();
        // Reload the page to reset the UI to the join screen cleanly
        // window.location.reload(); // Re-enable if you want automatic reset to join screen
    }
});
