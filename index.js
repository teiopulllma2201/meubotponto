// --- CONFIGURAÇÃO E SEGURANÇA ---
require('dotenv').config();

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Define o prefixo do seu bot
const PREFIX = '!'; 

// usersInSession: Armazena o estado ATUAL da sessão de trabalho do usuário.
const usersInSession = new Map(); 

// usersAwaitingPhoto: Rastreia qual tipo de foto o bot está esperando.
const usersAwaitingPhoto = new Map(); 
// ---------------------------------


// --- FUNÇÃO AUXILIAR: FORMATAR DURAÇÃO ---
function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');

    return `${pad(hours)}h, ${pad(minutes)}m e ${pad(seconds)}s`;
}


// --- EVENTO: BOT PRONTO ---
client.on("ready", () => {
    console.log(`Bot online como ${client.user.username}`);
});


// --- EVENTO: NOVA MENSAGEM ---
client.on("messageCreate", async (message) => {
    // Ignora DMs e mensagens de bots
    if (!message.inGuild() || message.author.bot) return;

    const userId = message.author.id;
    const session = usersInSession.get(userId);
    const isPaused = session && session.breakStartTime !== null;
    
    // =========================================================
    // PARSING DE COMANDOS
    // =========================================================
    
    // Se a mensagem não começa com o prefixo OU é uma resposta de foto, pule a checagem de comando.
    if (!message.content.startsWith(PREFIX)) {
        if (usersAwaitingPhoto.has(userId) && message.attachments.size > 0) {
            // Continua para o bloco de processamento de fotos abaixo
        } else {
            return; // Não é comando e não é foto esperada, então ignora
        }
    } else {
        // Remove o prefixo, remove espaços, e pega a primeira palavra (o comando)
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        let actionType = null;
        let errorMessage = null;
        
        // --- Lógica de Validação dos Comandos ---
        if (command === 'baterponto') {
            if (session) { errorMessage = "Você já tem um ponto em aberto. Use **!finalizarponto** para encerrar."; }
            else { actionType = 'START'; }
        } 
        else if (command === 'entradapausa') {
            if (!session) { errorMessage = "Você não tem um ponto em aberto para pausar."; }
            else if (isPaused) { errorMessage = "Você já está em pausa."; }
            else { actionType = 'BREAK_IN'; }
        }
        else if (command === 'saidapausa') {
            if (!session) { errorMessage = "Você não tem um ponto em aberto."; }
            else if (!isPaused) { errorMessage = "Você não está em pausa para sair."; }
            else { actionType = 'BREAK_OUT'; }
        }
        else if (command === 'finalizarponto') {
            if (!session) { errorMessage = "Você não tem um ponto em aberto para finalizar."; }
            else if (isPaused) { errorMessage = "Você deve sair da pausa (**!saidapausa**) antes de finalizar o ponto."; }
            else { actionType = 'END'; }
        }
        
        // --- Execução do Comando (Primeira Etapa) ---
        
        await message.delete().catch(console.error); // Apaga o comando

        if (errorMessage) {
            // CORREÇÃO: Envia mensagem normal, não reply
            await message.channel.send({ content: errorMessage }); 
            return;
        }

        if (actionType) {
            if (message.attachments.size > 0) {
                // CORREÇÃO: Envia mensagem normal, não reply
                await message.channel.send({ content: "Por favor, envie o comando e a foto em mensagens **separadas**." });
                return;
            }

            // Inicia a espera pela foto
            usersAwaitingPhoto.set(userId, actionType);
            
            // CORREÇÃO: Envia mensagem normal, não reply
            await message.channel.send({ 
                content: `📸 Comando recebido. Por favor, anexe a **foto para ${command}** na **próxima mensagem**.` 
            });
            return;
        }
    }


    // =========================================================
    // LÓGICA DE PROCESSAMENTO DE FOTOS (Segunda Etapa)
    // =========================================================
    if (usersAwaitingPhoto.has(userId) && message.attachments.size > 0) {
        
        const type = usersAwaitingPhoto.get(userId);
        usersAwaitingPhoto.delete(userId); // Limpa o estado de espera da foto

        const now = new Date();
        const dataFormatada = now.toLocaleDateString('pt-BR');
        const horaFormatada = now.toLocaleTimeString('pt-BR');
        const attachment = message.attachments.first();
        const imageUrl = attachment.url;
        
        let replyMessage = "";
        let fileName = "";
        let currentSession = usersInSession.get(userId);

        switch (type) {
            case 'START':
                usersInSession.set(userId, { startTime: now.getTime(), totalBreakTime: 0, breakStartTime: null });
                replyMessage = `✅ **BATE PONTO INICIADO** 📸 ${message.author.toString()}`;
                fileName = `ponto-inicio-${message.author.username}.jpg`;
                break;

            case 'BREAK_IN':
                currentSession.breakStartTime = now.getTime();
                replyMessage = `⏸️ **ENTRADA DE PAUSA** 📸 ${message.author.toString()}`;
                fileName = `pausa-entrada-${message.author.username}.jpg`;
                break;

            case 'BREAK_OUT':
                const breakDuration = now.getTime() - currentSession.breakStartTime;
                currentSession.totalBreakTime += breakDuration;
                currentSession.breakStartTime = null; 
                
                replyMessage = `▶️ **SAÍDA DE PAUSA** 📸 ${message.author.toString()}`
                            + `\nTempo de Pausa Adicionado: ${formatDuration(breakDuration)}`;
                fileName = `pausa-saida-${message.author.username}.jpg`;
                break;

            case 'END':
                const endTime = now.getTime();
                const totalWorkDuration = endTime - currentSession.startTime;
                const netWorkDuration = totalWorkDuration - currentSession.totalBreakTime;
                
                replyMessage = `🛑 **BATE PONTO FINALIZADO** 📸 ${message.author.toString()}`
                            + `\n**Duração Total da Sessão:** ${formatDuration(totalWorkDuration)}`
                            + `\n**Total de Pausas Acumuladas:** ${formatDuration(currentSession.totalBreakTime)}`
                            + `\n**Tempo Líquido de Trabalho:** ${formatDuration(netWorkDuration)}`;
                
                usersInSession.delete(userId); 
                fileName = `ponto-fim-${message.author.username}.jpg`;
                break;
        }

        // --- Envio da Mensagem Final ---
        try {
            await message.channel.send({
                content: `${replyMessage}\n**Data:** ${dataFormatada}\n**Hora:** ${horaFormatada}`,
                files: [{
                    attachment: imageUrl,
                    name: fileName
                }]
            });
            await message.delete(); 
        } catch (error) {
            console.error(`Erro ao processar foto [${type}]:`, error);
            message.channel.send({ content: "❌ Erro: Não consegui processar a foto. Verifique as permissões ou tente novamente." });
        }
    }
});
// ------------------------------------


// --- INICIAR BOT ---
client.login(process.env.DISCORD_TOKEN);