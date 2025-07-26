const OpenAI = require("openai");
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const { 
    waitForLatestConversation, 
    getConversationDetails, 
    getCurrentAgentInfo 
} = require('./elevenlabs-client');

// Simple version counter (in production, you'd use a database)
let versionCounter = 1;

/**
 * Generate improved system prompt based on conversation
 * HACKERS: CUSTOMIZE THIS FUNCTION FOR YOUR HACKATHON PROJECT
 * @param {string} currentPrompt - Current system prompt
 * @param {Array} transcript - Conversation transcript array
 * @param {Object} conversationData - Full conversation data from ElevenLabs
 * @returns {string} Improved system prompt
 */
// function generateImprovedPrompt(currentPrompt, transcript, conversationData) {
//     // HACKERS: This is where you implement your feedback logic!
//     // 
//     // You have access to:
//     // - currentPrompt: The current system prompt
//     // - transcript: Array of conversation messages [{role: 'user/agent', message: '...'}]
//     // - conversationData: Full conversation data (duration, metadata, etc.)
//     //
//     // Examples of what you could build:
//     // - Analyze conversation sentiment and adjust tone
//     // - Add domain-specific knowledge based on topics discussed
//     // - Modify questioning strategy based on user responses
//     // - Integrate with external LLMs (OpenAI, Claude, etc.) for prompt improvement
//     // - Add personality traits based on conversation patterns


//     // Remove any existing version tracking
//     let newPrompt = currentPrompt.replace(/\[Version \d+.*?\]/g, '').trim();
    
//     // Simple example: Add version tracking and basic conversation insights
//     const userMessages = transcript.filter(msg => msg.role === 'user');
//     const agentMessages = transcript.filter(msg => msg.role === 'agent');
//     const duration = conversationData.metadata?.call_duration_secs || 0;
    
//     // Add version and basic analytics
//     newPrompt += `\n\n[Version ${versionCounter + 1}] - Improved based on conversation analysis:
// - Conversation duration: ${duration} seconds
// - User messages: ${userMessages.length}
// - Agent messages: ${agentMessages.length}
// - Last conversation ID: ${conversationData.conversation_id}`;
    
//     // You could add more sophisticated improvements here:
//     // - Sentiment analysis
//     // - Topic detection
//     // - Response quality assessment
//     // - User satisfaction indicators
    
//     return newPrompt;
// }

async function generateImprovedPrompt(currentPrompt, transcript, convoData) {
   // 1. strip version tag
   let nextPrompt = currentPrompt.replace(/\[Version \d+.*?]/g, "").trim();
   // 2. Build a plain‑text transcript the LLM can grok
   const convoText = transcript
     .map(m => `${m.role === "user" ? "User" : "Mira"}: ${m.message}`)
     .join("\n");

   // 3. Ask GPT for a concise therapy‑centric summary
   let summary = "Summary unavailable.";
   try {
     const res = await openai.chat.completions.create({
       model: "gpt-3.5-turbo",
       temperature: 0.4,
       max_tokens: 120,
       messages: [
         {
           role: "system",
           content:
             "You are a therapy-session summarizer. Return:\n" +
             "1. Main theme in ≤7 words\n" +
             "2. Dominant user emotion in one word\n" +
             "3. 1 concrete next-step suggestion for CBT/ACT/mindfulness."
         },
         { role: "user", content: convoText }
       ]
     });
     summary = res.choices[0].message.content.trim();
   } catch (err) {
     console.error("⚠️  Summary gen failed:", err.message);
   }

   // 4. Compose new add‑on
   versionCounter += 1;
   nextPrompt +=
     `\n\n[Version ${versionCounter}] - Improved from latest session\n` +
     `### Session Snapshot\n${summary}\n` +
     `### Metadata (dev-only)\n` +
     `Duration ${convoData.call_duration_secs}s · ` +
     `${convoData.user_message_count} user msgs / ` +
     `${convoData.agent_message_count} agent msgs · ` +
     `ID ${convoData.conversation_id}`;


    if (nextPrompt.length > 7500) {
  // drop oldest Dynamic Add‑Ons before appending new one
    nextPrompt = nextPrompt.replace(/### Session Snapshot[\s\S]*?(?=\n###|$)/, "")
                         .trim();
}
   return nextPrompt;
}

/**
 * Main feedback loop processing function
 * This is called when a conversation ends
 * @param {string|null} currentPrompt - The current prompt to improve (if any)
 * @returns {Promise<Object>} Result with new version info and full prompt
 */
async function processConversationFeedback(currentPrompt = null) {
    try {
        console.log('🔄 Starting feedback loop processing...');
        
        // Step 1: Wait for and get the latest conversation
        const conversation = await waitForLatestConversation();
        if (!conversation) {
            throw new Error('No conversation found to analyze');
        }
        
        console.log(`📞 Found conversation: ${conversation.conversation_id}`);
        
        // Step 2: Get detailed conversation data
        const conversationDetails = await getConversationDetails(conversation.conversation_id);
        
        // Step 3: Get current agent prompt if not provided
        if (!currentPrompt) {
            const currentAgent = await getCurrentAgentInfo();
            currentPrompt = currentAgent.conversation_config?.agent?.prompt?.prompt || "You are a helpful assistant.";
        }
        
        // Step 4: Extract conversation transcript
        const transcript = conversationDetails.transcript || [];
        const userMessages = transcript.filter(msg => msg.role === 'user');
        const agentMessages = transcript.filter(msg => msg.role === 'agent');
        
        console.log(`🔧 Conversation analyzed - ${transcript.length} messages, ${userMessages.length} user, ${agentMessages.length} agent`);
        
        // Step 5: Generate improved prompt (THIS IS WHERE HACKERS CUSTOMIZE)
        // const improvedPrompt = await generateImprovedPrompt(currentPrompt, transcript, conversationDetails);

        const userMsgs  = transcript.filter(m => m.role === "user").length;
        const agentMsgs = transcript.filter(m => m.role === "assistant").length;

          const improvedPrompt = await generateImprovedPrompt(
            currentPrompt,
            transcript,
            {
              call_duration_secs: conversation.call_duration_secs,
              user_message_count: userMsgs,
              agent_message_count: agentMsgs,
              conversation_id:    conversation.conversation_id
            }
          );
        
        // Step 6: Increment version and return result
        versionCounter++;
        const result = {
            version: `${versionCounter}.0`,
            description: `Enhanced based on conversation analysis`,
            conversationAnalyzed: conversation.conversation_id,
            timestamp: new Date().toISOString(),
            fullPrompt: improvedPrompt  // Return the complete new prompt
        };
        
        console.log('✅ Feedback loop completed successfully');
        console.log(`📞 Analyzed conversation: ${conversation.conversation_id}`);
        console.log(`🔄 Generated new prompt version ${result.version}`);
        console.log(`📝 New prompt length: ${improvedPrompt.length} characters`);
        
        return result;
        
    } catch (error) {
        console.error('❌ Feedback loop failed:', error);
        throw error;
    }
}

module.exports = {
    processConversationFeedback,
    generateImprovedPrompt
};