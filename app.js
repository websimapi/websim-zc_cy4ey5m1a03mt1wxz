import { createApp, ref, reactive, computed, onMounted, watch } from 'vue';
import * as confettiModule from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';

createApp({
    setup() {
        // Room and connection
        const room = reactive(new WebsimSocket());
        const players = reactive({});
        const isHost = ref(false);
        
        // Player setup
        const playerName = ref('');
        const selectedRole = ref(null);
        const takenRoles = reactive({});
        const roles = [
            {
                id: 'decoder',
                name: 'Decoder',
                emoji: '🔍',
                description: 'Break codes and decipher encrypted messages.'
            },
            {
                id: 'distraction',
                name: 'Distraction Specialist',
                emoji: '🎭',
                description: 'Misdirect the Vault AI with wordplay and trivia.'
            },
            {
                id: 'clue',
                name: 'Clue Runner',
                emoji: '🧩',
                description: 'Connect clues to identify high-value words.'
            },
            {
                id: 'archivist',
                name: 'Archivist',
                emoji: '📚',
                description: 'Track words and categories to plan effective heists.'
            }
        ];
        
        // Game state
        const gameState = ref('lobby'); // lobby, playing, gameOver
        const timer = ref(90);
        const currentCategory = ref('');
        const aiMessages = ref([]);
        const playerResponse = ref('');
        const inputDisabled = ref(false);
        const stolenWords = ref([]);
        const wordsNeeded = ref(6);
        const activePlayer = ref(null);
        const alarmActive = ref(false);
        const gameWon = ref(false);
        const storyText = ref('');
        const storyRating = ref(0);
        const storyFeedback = ref('');
        
        // Visual effects
        const securityCells = ref([]);
        const responseInput = ref(null);
        
        // Game categories and challenges
        const categories = [
            'Rare Animals',
            'Obsolete Technology',
            'Untranslatable Feelings',
            'Mythical Creatures',
            'Ancient Artifacts',
            'Lost Languages',
            'Scientific Phenomena',
            'Architectural Wonders',
            'Forgotten Inventions',
            'Cosmic Enigmas'
        ];
        
        // Game challenges by role
        const challenges = {
            decoder: [
                {
                    type: 'anagram',
                    instruction: 'Decode this anagram to reveal a word from our target category:',
                    generate: (category) => {
                        // In a real implementation, this would use the AI to generate a relevant anagram
                        return {
                            clue: "NROCUION",
                            answer: "UNICORN"
                        };
                    }
                },
                {
                    type: 'cipher',
                    instruction: 'Crack this substitution cipher to steal a valuable word:',
                    generate: (category) => {
                        return {
                            clue: "XFMBO MFZBO",
                            key: "X=P, F=O, M=L, B=A, O=R",
                            answer: "POLAR BEAR"
                        };
                    }
                }
            ],
            distraction: [
                {
                    type: 'wordplay',
                    instruction: 'Distract the Vault AI with a clever word trick. Find a word that:',
                    generate: (category) => {
                        return {
                            clue: "Contains exactly three vowels and starts with the same letter it ends with",
                            examples: ["ANTENNA", "ENIGMA", "ALPACA"],
                            difficulty: "medium"
                        };
                    }
                },
                {
                    type: 'riddle',
                    instruction: 'Answer this riddle to buy time for your team:',
                    generate: (category) => {
                        return {
                            clue: "I'm tall when I'm young, and short when I'm old. What am I?",
                            answer: "CANDLE"
                        };
                    }
                }
            ],
            clue: [
                {
                    type: 'connection',
                    instruction: 'Connect these clues to identify our target word:',
                    generate: (category) => {
                        return {
                            clues: [
                                "Found in ancient myths",
                                "Associated with fire",
                                "Reborn from ashes",
                                "Symbol of immortality"
                            ],
                            answer: "PHOENIX"
                        };
                    }
                },
                {
                    type: 'wordchain',
                    instruction: 'Complete this word chain to reach our target. Change one letter at a time:',
                    generate: (category) => {
                        return {
                            start: "WORD",
                            end: "SAGE",
                            example: "WORD → WARD → WARE → WAGE → SAGE",
                            difficulty: "hard"
                        };
                    }
                }
            ],
            archivist: [
                {
                    type: 'categorize',
                    instruction: 'Identify a word that belongs to BOTH of these categories:',
                    generate: (category) => {
                        return {
                            categories: ["Musical Instruments", "Body Parts"],
                            answers: ["ORGAN", "DRUM", "HORN"],
                            difficulty: "medium"
                        };
                    }
                },
                {
                    type: 'define',
                    instruction: 'Provide a precise definition for this rare term:',
                    generate: (category) => {
                        return {
                            term: "PETRICHOR",
                            definition: "The pleasant smell that accompanies the first rain after a long period of dry weather",
                            difficulty: "hard"
                        };
                    }
                }
            ]
        };
        
        // Computed properties
        const canJoin = computed(() => {
            return playerName.value.trim() !== '' && selectedRole.value !== null;
        });
        
        const canStartGame = computed(() => {
            return Object.keys(players).length > 0 && allPlayersReady();
        });
        
        const canSubmitStory = computed(() => {
            return storyText.value.trim().length > 30 && 
                   stolenWords.value.every(word => 
                       storyText.value.toLowerCase().includes(word.toLowerCase()));
        });
        
        // Methods
        const selectRole = (roleId) => {
            if (takenRoles[roleId] && selectedRole.value !== roleId) return;
            selectedRole.value = roleId;
        };
        
        const joinGame = async () => {
            if (!canJoin.value) return;
            
            await initializeRoom();
            
            room.updatePresence({
                name: playerName.value,
                role: selectedRole.value,
                ready: true
            });
            
            // Add intro message
            addAiMessage({
                type: 'system',
                text: `Welcome, ${playerName.value}! You've joined as the ${getRoleName(selectedRole.value)}.`
            });
        };
        
        const startGame = () => {
            if (!canStartGame.value || !isHost.value) return;
            
            // Initialize game state in room
            room.updateRoomState({
                gameState: 'playing',
                currentCategory: selectRandomCategory(),
                roundTimer: 90,
                wordsNeeded: wordsNeeded.value,
                stolenWords: {},
                activeChallenge: null,
                activePlayer: Object.keys(players)[0]
            });
        };
        
        const submitResponse = () => {
            if (!playerResponse.value || inputDisabled.value) return;
            
            const response = playerResponse.value.trim();
            playerResponse.value = '';
            
            // In a real implementation, this would use the LLM to evaluate the response
            // For demo purposes, we'll simulate different outcomes
            const activeChallenge = room.roomState.activeChallenge;
            
            if (activeChallenge) {
                const isSuccessful = Math.random() > 0.3; // 70% success rate for demo
                
                if (isSuccessful) {
                    handleSuccessfulResponse(response);
                } else {
                    handleFailedResponse(response);
                }
            }
        };
        
        const submitStory = async () => {
            if (!canSubmitStory.value) return;
            
            // In a real implementation, this would use the LLM to evaluate the story
            // Simulate an AI evaluation for demo purposes
            setTimeout(() => {
                const rating = Math.floor(Math.random() * 3) + 3; // 3-5 stars
                storyRating.value = rating;
                
                if (rating === 5) {
                    storyFeedback.value = "Brilliant! Your creative use of the stolen words is masterful. The Vault AI is thoroughly impressed with your storytelling prowess.";
                    triggerConfetti();
                } else if (rating === 4) {
                    storyFeedback.value = "Well done! Your story effectively incorporates all stolen words into a coherent narrative. The Vault AI recognizes your skill.";
                } else {
                    storyFeedback.value = "Good attempt. Your story contains all the stolen words, though the narrative flow could be improved. The Vault AI acknowledges your heist as successful.";
                }
            }, 2000);
        };
        
        const returnToLobby = () => {
            if (isHost.value) {
                room.updateRoomState({
                    gameState: 'lobby',
                    currentCategory: '',
                    roundTimer: 0,
                    wordsNeeded: wordsNeeded.value,
                    stolenWords: {},
                    activeChallenge: null,
                    activePlayer: null
                });
            }
        };
        
        // Helper methods
        const initializeRoom = async () => {
            try {
                await room.initialize();
                
                // Subscribe to room state changes
                room.subscribeRoomState((currentRoomState) => {
                    handleRoomStateUpdate(currentRoomState);
                });
                
                // Subscribe to presence changes (player joins/leaves)
                room.subscribePresence((currentPresence) => {
                    handlePresenceUpdate(currentPresence);
                });
                
                // Subscribe to presence update requests
                room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
                    handlePresenceUpdateRequest(updateRequest, fromClientId);
                });
                
                // Set up message handler for events
                room.onmessage = (event) => {
                    handleRoomMessage(event);
                };
                
                // Check if we're the first player (host)
                setTimeout(() => {
                    const clientIds = Object.keys(room.presence);
                    isHost.value = clientIds.length === 1 || clientIds[0] === room.clientId;
                }, 500);
                
            } catch (error) {
                console.error("Failed to initialize room:", error);
                addAiMessage({
                    type: 'alarm',
                    text: "Connection failed. Unable to join the heist crew."
                });
            }
        };
        
        const handleRoomStateUpdate = (currentRoomState) => {
            if (!currentRoomState) return;
            
            // Handle game state changes
            if (currentRoomState.gameState === 'playing' && gameState.value !== 'playing') {
                startGameplay();
            } else if (currentRoomState.gameState === 'lobby' && gameState.value !== 'lobby') {
                resetGameState();
            }
            
            // Update timer
            if (currentRoomState.roundTimer !== undefined) {
                timer.value = currentRoomState.roundTimer;
            }
            
            // Update category
            if (currentRoomState.currentCategory) {
                currentCategory.value = currentRoomState.currentCategory;
            }
            
            // Update stolen words
            if (currentRoomState.stolenWords) {
                updateStolenWords(currentRoomState.stolenWords);
            }
            
            // Handle active player changes
            if (currentRoomState.activePlayer) {
                activePlayer.value = currentRoomState.activePlayer;
                
                // If I'm the active player and there's a new challenge
                if (currentRoomState.activePlayer === room.clientId && currentRoomState.activeChallenge) {
                    presentChallenge(currentRoomState.activeChallenge);
                }
            }
            
            // End game if word goal reached
            if (currentRoomState.stolenWords && 
                Object.keys(currentRoomState.stolenWords).length >= currentRoomState.wordsNeeded) {
                endGame(true);
            }
        };
        
        const handlePresenceUpdate = (currentPresence) => {
            // Update players list
            for (const clientId in currentPresence) {
                const presence = currentPresence[clientId];
                if (presence && presence.name && presence.role) {
                    // Add or update player
                    players[clientId] = {
                        name: presence.name,
                        role: presence.role,
                        ready: presence.ready || false
                    };
                    
                    // Mark role as taken
                    takenRoles[presence.role] = clientId;
                } else {
                    // Remove player if presence data is incomplete
                    delete players[clientId];
                    
                    // Find and clear any roles this player had
                    for (const role in takenRoles) {
                        if (takenRoles[role] === clientId) {
                            delete takenRoles[role];
                        }
                    }
                }
            }
            
            // Remove players who are no longer in the presence data
            for (const clientId in players) {
                if (!currentPresence[clientId]) {
                    delete players[clientId];
                    
                    // Find and clear any roles this player had
                    for (const role in takenRoles) {
                        if (takenRoles[role] === clientId) {
                            delete takenRoles[role];
                        }
                    }
                }
            }
        };
        
        const handlePresenceUpdateRequest = (updateRequest, fromClientId) => {
            if (updateRequest.type === 'challenge-feedback') {
                // Handle feedback about challenge performance
                if (updateRequest.success) {
                    addAiMessage({
                        type: 'success',
                        text: updateRequest.message || "Your teammate successfully completed their challenge!"
                    });
                } else {
                    addAiMessage({
                        type: 'alarm',
                        text: updateRequest.message || "Your teammate failed their challenge!"
                    });
                    triggerAlarm();
                }
            }
        };
        
        const handleRoomMessage = (event) => {
            const data = event.data;
            
            switch (data.type) {
                case "connected":
                    console.log(`Client ${data.clientId} (${data.username}) connected`);
                    if (gameState.value === 'playing') {
                        addAiMessage({
                            type: 'system',
                            text: `${data.username} has joined the heist!`
                        });
                    }
                    break;
                case "disconnected":
                    console.log(`Client ${data.clientId} (${data.username}) disconnected`);
                    if (gameState.value === 'playing') {
                        addAiMessage({
                            type: 'system',
                            text: `${data.username} has left the heist!`
                        });
                    }
                    break;
                case "word-stolen":
                    playSuccessSound();
                    break;
                case "alarm-triggered":
                    triggerAlarm();
                    break;
                default:
                    console.log("Received event:", data);
            }
        };
        
        const startGameplay = () => {
            gameState.value = 'playing';
            aiMessages.value = [];
            stolenWords.value = [];
            timer.value = 90;
            
            // Welcome message
            addAiMessage({
                type: 'system',
                text: `<b>HEIST INITIATED</b>: Welcome to The Vault of Knowledge!`
            });
            
            addAiMessage({
                type: 'hint',
                text: `Your target category is <b>${currentCategory.value}</b>. You need to steal ${wordsNeeded.value} words to complete the heist.`
            });
            
            // Start main game loop
            startGameLoop();
        };
        
        const startGameLoop = () => {
            // Start timer
            const timerInterval = setInterval(() => {
                if (gameState.value !== 'playing') {
                    clearInterval(timerInterval);
                    return;
                }
                
                if (timer.value > 0) {
                    if (isHost.value) {
                        room.updateRoomState({
                            roundTimer: timer.value - 1
                        });
                    }
                } else {
                    // Time's up, change category
                    if (isHost.value) {
                        const newCategory = selectRandomCategory();
                        room.updateRoomState({
                            currentCategory: newCategory,
                            roundTimer: 90
                        });
                        
                        // Send category change message
                        room.send({
                            type: "category-changed",
                            category: newCategory
                        });
                    }
                }
            }, 1000);
            
            // Assign challenges to players periodically
            const challengeInterval = setInterval(() => {
                if (gameState.value !== 'playing') {
                    clearInterval(challengeInterval);
                    return;
                }
                
                if (isHost.value && !room.roomState.activeChallenge) {
                    assignRandomChallenge();
                }
            }, 5000);
            
            // Randomly update security grid
            const securityInterval = setInterval(() => {
                if (gameState.value !== 'playing') {
                    clearInterval(securityInterval);
                    return;
                }
                
                updateSecurityGrid();
            }, 3000);
        };
        
        const assignRandomChallenge = () => {
            const playersArray = Object.keys(players);
            if (playersArray.length === 0) return;
            
            // Pick a random player
            const randomIndex = Math.floor(Math.random() * playersArray.length);
            const playerId = playersArray[randomIndex];
            const playerRole = players[playerId].role;
            
            // Get challenges for this role
            const roleSpecificChallenges = challenges[playerRole];
            if (!roleSpecificChallenges || roleSpecificChallenges.length === 0) return;
            
            // Pick a random challenge
            const challengeIndex = Math.floor(Math.random() * roleSpecificChallenges.length);
            const challenge = roleSpecificChallenges[challengeIndex];
            
            // Generate challenge details using the category
            const challengeDetails = challenge.generate(currentCategory.value);
            
            // Assign challenge
            room.updateRoomState({
                activePlayer: playerId,
                activeChallenge: {
                    type: challenge.type,
                    instruction: challenge.instruction,
                    details: challengeDetails,
                    role: playerRole,
                    timeLimit: 20 // seconds
                }
            });
        };
        
        const presentChallenge = (challenge) => {
            if (!challenge) return;
            
            // Format the challenge message
            let challengeText = `<b>${challenge.instruction}</b><br>`;
            
            // Add challenge-specific details
            switch (challenge.type) {
                case 'anagram':
                    challengeText += `<div class="challenge-content">${challenge.details.clue}</div>`;
                    break;
                case 'cipher':
                    challengeText += `<div class="challenge-content">${challenge.details.clue}<br>Hint: ${challenge.details.key}</div>`;
                    break;
                case 'wordplay':
                    challengeText += `<div class="challenge-content">${challenge.details.clue}</div>`;
                    break;
                case 'riddle':
                    challengeText += `<div class="challenge-content">${challenge.details.clue}</div>`;
                    break;
                case 'connection':
                    challengeText += `<div class="challenge-content">${challenge.details.clues.join('<br>')}</div>`;
                    break;
                case 'wordchain':
                    challengeText += `<div class="challenge-content">Start: ${challenge.details.start}<br>End: ${challenge.details.end}<br>Example path: ${challenge.details.example}</div>`;
                    break;
                case 'categorize':
                    challengeText += `<div class="challenge-content">${challenge.details.categories.join(' + ')}</div>`;
                    break;
                case 'define':
                    challengeText += `<div class="challenge-content">${challenge.details.term}</div>`;
                    break;
                default:
                    challengeText += `<div class="challenge-content">Solve this challenge!</div>`;
            }
            
            // Add the message with a timer
            const message = {
                type: 'challenge',
                text: challengeText,
                timer: challenge.timeLimit
            };
            
            addAiMessage(message);
            
            // Enable input and focus it
            inputDisabled.value = false;
            setTimeout(() => {
                if (responseInput.value) {
                    responseInput.value.focus();
                }
            }, 100);
            
            // Set up timer countdown on the message
            let timeLeft = challenge.timeLimit;
            const messageIndex = aiMessages.value.length - 1;
            
            const countdownInterval = setInterval(() => {
                if (gameState.value !== 'playing' || !aiMessages.value[messageIndex]) {
                    clearInterval(countdownInterval);
                    return;
                }
                
                timeLeft--;
                aiMessages.value[messageIndex].timer = timeLeft;
                
                if (timeLeft <= 0) {
                    clearInterval(countdownInterval);
                    handleChallengeTimeout();
                }
            }, 1000);
        };
        
        const handleSuccessfulResponse = (response) => {
            const challenge = room.roomState.activeChallenge;
            
            // Add a stolen word from the current category
            let stolenWord;
            
            // In a real implementation, this would use the LLM to generate or validate a relevant word
            // For demo purposes, we'll use the answer from the challenge if available
            if (challenge.details.answer) {
                stolenWord = challenge.details.answer;
            } else if (challenge.details.answers && challenge.details.answers.length > 0) {
                stolenWord = challenge.details.answers[0];
            } else {
                // Generate a random word related to the category
                const categoryWords = {
                    'Rare Animals': ['Axolotl', 'Pangolin', 'Okapi', 'Narwhal', 'Quokka'],
                    'Obsolete Technology': ['Betamax', 'Floppy', 'Typewriter', 'Pager', 'Phonograph'],
                    'Untranslatable Feelings': ['Hygge', 'Saudade', 'Waldeinsamkeit', 'Komorebi', 'Yugen'],
                    'Mythical Creatures': ['Phoenix', 'Kraken', 'Wendigo', 'Banshee', 'Chimera'],
                    'Ancient Artifacts': ['Ankh', 'Codex', 'Runestone', 'Sarcophagus', 'Amphora'],
                    'Lost Languages': ['Sumerian', 'Etruscan', 'Rongorongo', 'Voynich', 'Linear A'],
                    'Scientific Phenomena': ['Bioluminescence', 'Sonoluminescence', 'Piezoelectricity', 'Magnetohydrodynamics', 'Chronostasis'],
                    'Architectural Wonders': ['Ziggurat', 'Acropolis', 'Pantheon', 'Hagia Sophia', 'Angkor Wat'],
                    'Forgotten Inventions': ['Antikythera', 'Damascus Steel', 'Greek Fire', 'Archimedes Screw', 'Automaton'],
                    'Cosmic Enigmas': ['Quasar', 'Magnetar', 'Dark Matter', 'Neutron Star', 'Black Hole']
                };
                
                const wordsForCategory = categoryWords[currentCategory.value] || ['Mystery', 'Secret', 'Enigma', 'Riddle', 'Puzzle'];
                const randomIndex = Math.floor(Math.random() * wordsForCategory.length);
                stolenWord = wordsForCategory[randomIndex];
            }
            
            // Check if word is already stolen
            const existingWords = Object.values(room.roomState.stolenWords || {});
            if (existingWords.includes(stolenWord)) {
                // Pick another word (simplified for demo)
                stolenWord = stolenWord + " " + Math.floor(Math.random() * 100);
            }
            
            // Add success message
            addAiMessage({
                type: 'success',
                text: `<b>SUCCESS!</b> You've stolen the word "${stolenWord}" from the vault!`
            });
            
            // Update room state with the new word
            const stolenWordsUpdate = { ...room.roomState.stolenWords } || {};
            const wordKey = `word-${Date.now()}`;
            stolenWordsUpdate[wordKey] = stolenWord;
            
            room.updateRoomState({
                stolenWords: stolenWordsUpdate,
                activeChallenge: null,
                activePlayer: null
            });
            
            // Notify other players
            for (const clientId in players) {
                if (clientId !== room.clientId) {
                    room.requestPresenceUpdate(clientId, {
                        type: 'challenge-feedback',
                        success: true,
                        message: `${players[room.clientId].name} successfully stole the word "${stolenWord}"!`
                    });
                }
            }
            
            // Broadcast success for sound effect
            room.send({
                type: "word-stolen",
                word: stolenWord,
                player: players[room.clientId].name
            });
            
            // Disable input
            inputDisabled.value = true;
        };
        
        const handleFailedResponse = (response) => {
            // Add failure message
            addAiMessage({
                type: 'alarm',
                text: `<b>ALERT!</b> Your attempt failed and triggered a security response!`
            });
            
            // Update room state
            room.updateRoomState({
                activeChallenge: null,
                activePlayer: null
            });
            
            // Notify other players
            for (const clientId in players) {
                if (clientId !== room.clientId) {
                    room.requestPresenceUpdate(clientId, {
                        type: 'challenge-feedback',
                        success: false,
                        message: `${players[room.clientId].name} triggered an alarm! Be careful!`
                    });
                }
            }
            
            // Broadcast alarm for sound/visual effect
            room.send({
                type: "alarm-triggered",
                player: players[room.clientId].name
            });
            
            // Trigger alarm effects
            triggerAlarm();
            
            // Disable input
            inputDisabled.value = true;
        };
        
        const handleChallengeTimeout = () => {
            // Add timeout message
            addAiMessage({
                type: 'alarm',
                text: `<b>TIME'S UP!</b> You didn't respond in time and triggered a security alert!`
            });
            
            // Update room state
            if (isHost.value) {
                room.updateRoomState({
                    activeChallenge: null,
                    activePlayer: null
                });
            }
            
            // Notify other players
            for (const clientId in players) {
                if (clientId !== room.clientId) {
                    room.requestPresenceUpdate(clientId, {
                        type: 'challenge-feedback',
                        success: false,
                        message: `${players[room.clientId].name} ran out of time and triggered an alarm!`
                    });
                }
            }
            
            // Broadcast alarm for sound/visual effect
            room.send({
                type: "alarm-triggered",
                player: players[room.clientId].name
            });
            
            // Trigger alarm effects
            triggerAlarm();
            
            // Disable input
            inputDisabled.value = true;
        };
        
        const updateStolenWords = (stolenWordsObj) => {
            if (!stolenWordsObj) {
                stolenWords.value = [];
                return;
            }
            
            // Convert object to array of words
            stolenWords.value = Object.values(stolenWordsObj);
            
            // Check if we've reached the goal
            if (stolenWords.value.length >= wordsNeeded.value && gameState.value === 'playing') {
                endGame(true);
            }
        };
        
        const endGame = (won) => {
            gameState.value = 'gameOver';
            gameWon.value = won;
            
            if (won) {
                triggerConfetti();
            }
        };
        
        const resetGameState = () => {
            gameState.value = 'lobby';
            aiMessages.value = [];
            timer.value = 90;
            currentCategory.value = '';
            stolenWords.value = [];
            inputDisabled.value = false;
            alarmActive.value = false;
            storyText.value = '';
            storyRating.value = 0;
            storyFeedback.value = '';
        };
        
        // Utility methods
        const selectRandomCategory = () => {
            const randomIndex = Math.floor(Math.random() * categories.length);
            return categories[randomIndex];
        };
        
        const updateSecurityGrid = () => {
            // Randomly activate/deactivate security cells
            const newActiveCells = [];
            const cellCount = Math.floor(Math.random() * 10) + 5;
            
            for (let i = 0; i < cellCount; i++) {
                const cellNumber = Math.floor(Math.random() * 36) + 1;
                if (!newActiveCells.includes(cellNumber)) {
                    newActiveCells.push(cellNumber);
                }
            }
            
            securityCells.value = newActiveCells;
        };
        
        const triggerAlarm = () => {
            alarmActive.value = true;
            
            // Play alarm sound
            playAlarmSound();
            
            // Reset after 3 seconds
            setTimeout(() => {
                alarmActive.value = false;
            }, 3000);
        };
        
        const triggerConfetti = () => {
            confettiModule.default({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 }
            });
        };
        
        const playSuccessSound = () => {
            // In a real implementation, this would play a success sound
            console.log("Success sound played");
        };
        
        const playAlarmSound = () => {
            // In a real implementation, this would play an alarm sound
            console.log("Alarm sound played");
        };
        
        const addAiMessage = (message) => {
            aiMessages.value.push(message);
            
            // Scroll to bottom
            setTimeout(() => {
                const chatContainer = document.querySelector('.vault-comms');
                if (chatContainer) {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            }, 50);
        };
        
        const allPlayersReady = () => {
            for (const clientId in players) {
                if (!players[clientId].ready) {
                    return false;
                }
            }
            return true;
        };
        
        const getRoleEmoji = (roleId) => {
            const role = roles.find(r => r.id === roleId);
            return role ? role.emoji : '❓';
        };
        
        const getRoleName = (roleId) => {
            const role = roles.find(r => r.id === roleId);
            return role ? role.name : 'Unknown';
        };
        
        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };
        
        // Initialize
        onMounted(() => {
            // Security grid animation
            updateSecurityGrid();
        });
        
        return {
            // State
            room,
            players,
            isHost,
            playerName,
            selectedRole,
            takenRoles,
            roles,
            gameState,
            timer,
            currentCategory,
            aiMessages,
            playerResponse,
            inputDisabled,
            stolenWords,
            wordsNeeded,
            activePlayer,
            alarmActive,
            gameWon,
            storyText,
            storyRating,
            storyFeedback,
            securityCells,
            responseInput,
            
            // Computed
            canJoin,
            canStartGame,
            canSubmitStory,
            
            // Methods
            selectRole,
            joinGame,
            startGame,
            submitResponse,
            submitStory,
            returnToLobby,
            getRoleEmoji,
            getRoleName,
            formatTime
        };
    }
}).mount('#app');