// src/utils/kafka.js
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'attendance-backend',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
});

const producer = kafka.producer();

async function connectProducer() {
  try {
    await producer.connect();
    console.log('[Kafka] Producer connected successfully.');
  } catch (err) {
    console.error('[Kafka] Connection failed:', err);
  }
}

async function publishEvent(topic, message) {
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
  } catch (err) {
    console.error(`[Kafka] Failed to publish event to ${topic}:`, err);
  }
}

module.exports = {
  connectProducer,
  publishEvent
};
