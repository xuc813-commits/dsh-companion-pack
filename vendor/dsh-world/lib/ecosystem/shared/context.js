import { conversationKey, speakerIdentity } from "./identity.js";
function channelImage(value) {
    if (!value || typeof value !== 'object')
        throw new Error('Invalid channel image');
    const image = value;
    if (typeof image.file !== 'string' || !/^[a-f0-9]{64}\.png$/.test(image.file)
        || !['original', 'cached', 'thumbnail'].includes(image.quality)
        || (image.firstFrame !== undefined && typeof image.firstFrame !== 'boolean'))
        throw new Error('Invalid channel image');
    return { file: image.file, quality: image.quality, ...(image.firstFrame === undefined ? {} : { firstFrame: image.firstFrame }) };
}
export function channelReference(value, current) {
    if (value === undefined)
        return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value)) > 16 * 1024)
        throw new Error('Invalid quoted message');
    const input = value;
    if (!['text', 'image', 'sticker', 'other'].includes(input.type) || typeof input.text !== 'string' || !input.text.trim() || [...input.text].length > 2000)
        throw new Error('Invalid quoted content');
    if (input.id !== undefined && (typeof input.id !== 'string' || !/^[0-9]{1,20}$/.test(input.id) || BigInt(input.id) < 1n || BigInt(input.id) >= 1n << 64n))
        throw new Error('Invalid quoted ID');
    if (input.speakerId !== undefined)
        speakerIdentity({ ...current, speakerId: input.speakerId });
    if (input.speakerName !== undefined)
        speakerIdentity({ ...current, speakerName: input.speakerName });
    if (input.error !== undefined && (typeof input.error !== 'string' || !input.error.trim() || input.error.length > 500))
        throw new Error('Invalid quoted error');
    const image = input.image === undefined ? undefined : channelImage(input.image);
    if (image && (!input.id || !input.speakerId || input.error || !['image', 'sticker'].includes(input.type)))
        throw new Error('Invalid quoted image');
    return { type: input.type, text: input.text,
        ...(input.id === undefined ? {} : { id: input.id }),
        ...(input.speakerId === undefined ? {} : { speakerId: input.speakerId }),
        ...(input.speakerName === undefined ? {} : { speakerName: input.speakerName }),
        ...(input.error === undefined ? {} : { error: input.error }), ...(image ? { image } : {}) };
}
export function channelContext(value, current, limit = 8) {
    if (value === undefined || (Array.isArray(value) && value.length === 0))
        return [];
    if (current.conversationType !== 'group')
        throw new Error('Invalid group context');
    return contextMessages(value, current, limit);
}
export function channelMedia(value, current) {
    if (value === undefined || (Array.isArray(value) && value.length === 0))
        return [];
    if (current.conversationType !== 'private')
        throw new Error('Invalid private media');
    const messages = contextMessages(value, current, 2);
    if (messages.some(message => message.identity.speakerId !== current.speakerId))
        throw new Error('Media belongs to another speaker');
    if (new Set(messages.map(message => message.id)).size !== messages.length)
        throw new Error('Duplicate media message');
    return messages;
}
function contextMessages(value, current, limit) {
    if (!Array.isArray(value) || value.length > limit || Buffer.byteLength(JSON.stringify(value)) > 16 * 1024)
        throw new Error('Invalid channel context');
    let images = 0;
    return value.map(item => {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || item.id.length > 256 || /[\u0000-\u001f\u007f]/.test(item.id)
            || typeof item.occurredAt !== 'string' || item.occurredAt.length > 40 || !Number.isFinite(Date.parse(item.occurredAt))
            || typeof item.text !== 'string' || !item.text.trim() || [...item.text].length > 2000)
            throw new Error('Invalid context message');
        const identity = speakerIdentity(item.identity);
        if (conversationKey(identity) !== conversationKey(current))
            throw new Error('Context belongs to another conversation');
        let image;
        if (item.image !== undefined) {
            if (++images > 2)
                throw new Error('Invalid group image');
            image = channelImage(item.image);
        }
        const reference = channelReference(item.reference, current);
        if (reference?.image && ++images > 2)
            throw new Error('Invalid group image');
        return { id: item.id, occurredAt: item.occurredAt, text: item.text, identity, ...(image ? { image } : {}), ...(reference ? { reference } : {}) };
    });
}
