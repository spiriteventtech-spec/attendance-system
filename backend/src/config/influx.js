// src/config/influx.js
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

const url = process.env.INFLUX_URL || 'http://localhost:8086';
const token = process.env.INFLUX_TOKEN;
const org = process.env.INFLUX_ORG || 'eventstrack';
const bucket = process.env.INFLUX_BUCKET || 'gps_pings';

const influxClient = new InfluxDB({ url, token });
const writeApi = influxClient.getWriteApi(org, bucket, 'ns'); // Nanosecond precision

module.exports = {
  influxClient,
  writeApi,
  Point
};
