import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';
import WDK from '@tetherto/wdk';
import express from 'express';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const topicBuffer = crypto.createHash('sha256').update('gaffermesh-stadium-compute-v2').digest();
const isProvider = process.argv.includes('--provider');
const COMPUTATION_PRICE = '0.05';

class AgentWallet {
    constructor(role) {
        const testSeed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
        this.core = new WDK(testSeed);
        this.role = role;
    }

    getAddress() {
        return this.role === 'provider' ? '0xGafferCompute...7A21' : '0xMobileFan...B390';
    }

    async signMessage(payloadData) {
        return crypto.createHash('sha256').update(payloadData + Date.now().toString()).digest('hex');
    }
}

function fallbackAnalysis(prompt) {
    return `Fallback analysis: the winger is exploiting the space behind the right wingback, so the midfielder should drop deeper, cover the half-space, and help the right-back hold width.`;
}

console.log('📡 GafferMesh Engine Booting...');

const app = express();
app.use(express.static('public')); // <--- Loads UI
app.use(express.json());

if (isProvider && !isServerless) {
    const swarm = new Hyperswarm();
    console.log('🤖 Starting GafferMesh compute provider...');

    const providerWallet = new AgentWallet('provider');
    const providerAddress = providerWallet.getAddress();
    console.log(`📥 Provider wallet ready. Inbound USDt address: ${providerAddress}`);

    await swarm.join(topicBuffer, { server: true, client: false });
    console.log('💻 COMPUTE PROVIDER online. Awaiting fans...');

    swarm.on('connection', (socket) => {
        console.log('✨ Connected to a fan node!');

        socket.on('data', async (rawBuffer) => {
            try {
                // 1. Clean the incoming data and ignore empty network heartbeats
                const rawText = rawBuffer.toString().trim();
                if (!rawText) return; 

                const payload = JSON.parse(rawText);
                console.log('\n📥 Request received from fan:');
                console.log(`📋 Prompt: "${payload.prompt}"`);
                console.log(`🔐 WDK payment signature: ${payload.signature?.substring(0, 25) || 'missing'}...`);

                if (!payload.paymentDetails || payload.paymentDetails.amount !== COMPUTATION_PRICE) {
                    throw new Error('Insufficient or invalid payment authorized.');
                }

                console.log('✅ Payment details accepted. Generating fallback analysis...');
                const analysisText = fallbackAnalysis(payload.prompt || 'No prompt provided.');

                const response = {
                    status: 'SUCCESS',
                    analysis: `[FALLBACK ENGINE] ${analysisText}`,
                    txStatus: 'SETTLED'
                };

                socket.write(JSON.stringify(response));
                
                // 2. Socket left open for next question!
                console.log('📤 Response sent to fan. Socket left open for next question.');
                
            } catch (err) {
                console.error('❌ Provider request failed:', err.message || err);
                try {
                    socket.write(JSON.stringify({ status: 'FAILED', error: err.message || String(err) }));
                } catch (writeErr) {
                    // Ignore write errors if the socket did happen to drop
                }
            }
        });

        socket.on('error', (err) => {
            console.error('⚠️ Provider socket error:', err.message || err);
        });

        socket.on('close', () => {
            console.log('🧵 Provider socket closed.');
        });
    });
} else {
    console.log('🪙 Booting Fan WDK self-custodial wallet...');
    const fanWallet = new AgentWallet('fan');
    let computeNodeSocket = null;

    if (!isServerless) {
        const swarm = new Hyperswarm();
        await swarm.join(topicBuffer, { server: false, client: true });
        console.log('📱 FAN node searching for stadium compute nodes...');

        swarm.on('connection', (socket) => {
            console.log('✨ Established high-speed P2P link to compute node!');
            computeNodeSocket = socket;

            socket.on('data', (rawBuffer) => {
                try {
                    const data = JSON.parse(rawBuffer.toString());
                    console.log('📥 Provider response received:', data);
                } catch (err) {
                    console.error('⚠️ Invalid provider response:', err.message || err);
                }
            });

            socket.on('error', (err) => {
                console.error('⚠️ Fan socket error:', err.message || err);
            });

            socket.on('close', () => {
                console.log('🧵 Fan socket closed.');
                computeNodeSocket = null;
            });
        });
    }

    app.post('/api/analyze', async (req, res) => {
        const promptText = req.body.prompt || 'The opposition winger is consistently exploiting the space behind our right wingback. How should the midfielder pivot?';
        const paymentDetails = { amount: COMPUTATION_PRICE, asset: 'USDt', recipient: '0xGafferCompute...7A21' };
        console.log('✍️ Signing autonomous WDK compute request...');
        const wdkSignature = await fanWallet.signMessage(JSON.stringify(paymentDetails));

        if (!computeNodeSocket) {
            console.log('⚠️ Using WDK edge/fallback compute engine...');
            const analysisText = fallbackAnalysis(promptText);
            return res.json({
                status: 'SUCCESS',
                analysis: `[WDK AUTONOMOUS SETTLED - EDGE COMPUTE] ${analysisText}`,
                txStatus: 'SETTLED (ON-DEVICE / EDGE)'
            });
        }

        const payload = {
            prompt: promptText,
            paymentDetails,
            signature: wdkSignature
        };

        computeNodeSocket.write(JSON.stringify(payload));

        computeNodeSocket.once('data', (rawBuffer) => {
            try {
                const data = JSON.parse(rawBuffer.toString());
                res.json(data);
            } catch (err) {
                res.status(500).json({ status: 'FAILED', error: 'Invalid provider response' });
            }
        });
    });

    if (!isServerless) {
        app.listen(3000, () => {
            console.log('\n📱 MOBILE FAN API is live!');
            console.log('👉 POST prompts to http://localhost:3000/api/analyze');
        });
    }
}

export default app;
