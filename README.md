<<<<<<< HEAD
# Smart Dustbin Premium Command Center

A full-stack Smart Dustbin project using ESP-12E/ESP8266, 2×HC-SR04, SG90 servo, Adafruit IO and Web3Forms.

## Stack

- Firmware: Arduino C++ for ESP8266
- Frontend: HTML + CSS + Vanilla JavaScript + Chart.js
- Backend: Node.js + Express
- Telemetry: Adafruit IO MQTT on device, REST API via server
- Alerts: Web3Forms

## Feeds

The dashboard expects these Adafruit IO feeds:

- garbage-distance
- garbage-level
- garbage-status
- hand-distance
- lid-status
- esp32-status

## Run locally

1. Open `server/.env.example`, make a copy named `.env` and fill the credentials.
2. From the `server` folder run:

```bash
npm install
npm start
```

3. Open `http://localhost:5000`.

## Firmware

Open `firmware/smart_dustbin_esp8266.ino` in Arduino IDE and fill the Wi-Fi, Adafruit IO and Web3Forms values.

## Hardware pins

- HC-SR04 #1 hand: TRIG D5/GPIO14, ECHO D6/GPIO12
- HC-SR04 #2 garbage: TRIG D1/GPIO5, ECHO D2/GPIO4
- SG90 signal: D7/GPIO13

For standard 5V HC-SR04 modules, protect ECHO with a voltage divider before the ESP8266 GPIO.

## Notes

The web dashboard keeps Adafruit IO and Web3Forms credentials on the Node/Express server. Do not hard-code real secrets into frontend JavaScript.

## Full-bin dashboard animation

The dashboard polls Adafruit IO through the Node/Express API every 5 seconds. When `garbage-status` reports `FULL` (or the level feed reaches 100%), the bin fill turns red and pulses, the indicator ring animates, and the lid opens visually. The UI is visual only; the ESP8266 firmware remains responsible for the physical servo and buzzer.
=======
# smart-dustbin-premium
>>>>>>> 6416b3e593cbcff54c447a339644cb4ed5b12557
