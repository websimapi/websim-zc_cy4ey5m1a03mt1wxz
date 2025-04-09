// This file will contain the core game logic and AI interactions
// It will be integrated with the LLM calls using websim's capabilities

class MindThiefGame {
    constructor(room, llm) {
        this.room = room;
        this.llm = llm;
        this.categories = [
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
        this.conversationHistory = [];
    }
    
    async generateChallenge(playerRole, category) {
        try {
            // Add to conversation history
            this.conversationHistory.push({
                role: "user",
                content: `Generate a word challenge for a player with the role "${playerRole}" related to the category "${category}".`
            });
            
            // Keep conversation history manageable
            this.conversationHistory = this.conversationHistory.slice(-5);
            
            const completion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are the Vault AI in a word heist game. Generate challenging but solvable word puzzles based on player roles:
                          - Decoder: Create anagrams or ciphers to decrypt
                          - Distraction Specialist: Create wordplay challenges or riddles
                          - Clue Runner: Create word association or connection challenges
                          - Archivist: Create category or definition challenges
                          
                          The challenge should be related to the current category and should result in a word that fits that category.
                          
                          Respond with JSON in this format:
                          {
                            "type": "anagram|cipher|wordplay|riddle|connection|wordchain|categorize|define",
                            "instruction": "Brief instruction for the player",
                            "challenge": "The actual puzzle or question",
                            "hint": "Optional hint to help the player",
                            "answer": "The expected answer or solution",
                            "acceptableAnswers": ["array", "of", "other", "acceptable", "answers"],
                            "difficulty": "easy|medium|hard",
                            "timeLimit": 20
                          }`
                    },
                    ...this.conversationHistory
                ],
                json: true
            });
            
            // Add response to conversation history
            this.conversationHistory.push(completion);
            
            return JSON.parse(completion.content);
        } catch (error) {
            console.error("Error generating challenge:", error);
            // Fallback challenge in case of error
            return {
                type: "riddle",
                instruction: "Answer this riddle to proceed:",
                challenge: "I'm light as a feather, but even the strongest person can't hold me for more than a minute. What am I?",
                answer: "breath",
                acceptableAnswers: ["breath", "breathing", "air"],
                difficulty: "medium",
                timeLimit: 20
            };
        }
    }
    
    async evaluateResponse(challenge, response, category) {
        try {
            // Add to conversation history
            this.conversationHistory.push({
                role: "user",
                content: `Evaluate this response: "${response}" for the challenge: "${challenge.challenge}" with expected answer: "${challenge.answer}". Category: "${category}".`
            });
            
            // Keep conversation history manageable
            this.conversationHistory = this.conversationHistory.slice(-5);
            
            const completion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are the Vault AI evaluating player responses in a word heist game.
                          Evaluate if the player's response matches the expected answer or is close enough to be acceptable.
                          Consider acceptable answers, synonyms, and creative interpretations, especially for more subjective challenges.
                          
                          Respond with JSON in this format:
                          {
                            "correct": true|false,
                            "feedback": "Brief explanation of why the answer is correct or incorrect",
                            "stolenWord": "If correct, what word was successfully stolen (use answer or a refined version)",
                            "severity": 0-10 (if incorrect, how severe was the failure, with 10 being the most severe)
                          }`
                    },
                    ...this.conversationHistory
                ],
                json: true
            });
            
            // Add response to conversation history
            this.conversationHistory.push(completion);
            
            return JSON.parse(completion.content);
        } catch (error) {
            console.error("Error evaluating response:", error);
            // Fallback evaluation in case of error
            const isCorrect = response.toLowerCase().includes(challenge.answer.toLowerCase());
            return {
                correct: isCorrect,
                feedback: isCorrect ? "That is correct!" : "Not quite right. Try again!",
                stolenWord: isCorrect ? challenge.answer : null,
                severity: isCorrect ? 0 : 5
            };
        }
    }
    
    async evaluateFinalStory(story, stolenWords) {
        try {
            const prompt = `Evaluate this final heist story that should incorporate all these stolen words: ${stolenWords.join(', ')}. Story: "${story}"`;
            
            const completion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are the Vault AI evaluating the final heist story in a word game.
                          The players have stolen words and now need to create a coherent story using all of them.
                          
                          Evaluate:
                          1. Did they use ALL the stolen words? (This is mandatory)
                          2. How creative and coherent is the story?
                          3. How well did they integrate the words?
                          
                          Respond with JSON in this format:
                          {
                            "allWordsUsed": true|false,
                            "rating": 1-5 (stars, with 5 being excellent),
                            "feedback": "Detailed, entertaining feedback about their story",
                            "missingWords": ["any", "words", "they", "missed"]
                          }`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                json: true
            });
            
            return JSON.parse(completion.content);
        } catch (error) {
            console.error("Error evaluating story:", error);
            // Fallback story evaluation
            const allWordsUsed = stolenWords.every(word => 
                story.toLowerCase().includes(word.toLowerCase()));
                
            return {
                allWordsUsed: allWordsUsed,
                rating: allWordsUsed ? 4 : 2,
                feedback: allWordsUsed ? 
                    "Well done! You've crafted a creative story using all the stolen words." : 
                    "Your story is missing some of the stolen words. A complete heist requires using all stolen items!",
                missingWords: allWordsUsed ? [] : 
                    stolenWords.filter(word => !story.toLowerCase().includes(word.toLowerCase()))
            };
        }
    }
    
    getRandomCategory() {
        const index = Math.floor(Math.random() * this.categories.length);
        return this.categories[index];
    }
}

export default MindThiefGame;

