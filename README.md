# Discord Calendar Bot

A simple Discord calendar bot built with [discord.js](https://discord.js.org/) v14, capable of importing your Google Calendar into events for the server.

## Features

- Google Calendar -> Discord
- Event Creation
- Auto Syncing
- Supports multiple calendars

## Requirements

- [Node.js](https://nodejs.org/)
- [Discord Bot Application](https://discord.com/developers/applications)
- [Google Calendar API](https://console.cloud.google.com/marketplace/product/google/calendar-json.googleapis.com?project=prefab-drake-510306-g3)

## Discord Setup

1. Navigate to the [Discord Developer Portal](https://discord.com/developers/home)

2. Create a new application

3. In the OAuth2 tab check the following boxes:

<img width="668" height="874" alt="{47626930-08A4-4D24-A724-17F15F1E487D}" src="https://github.com/user-attachments/assets/4111f5c3-44f5-4ec5-80f6-f34efe29938b" />

5. Then copy the URL at the bottom of the page and paste into your browser to invite the bot.

## Google Setup

1. In the Google Cloud Console, create a project

2. Enable Google Calendar API

3. Create a service account and download the JSON key. Save it as `service-account.json`

4. In your Google Calendar Settings, Share with the service account's email with the ability to see all event details

5. Copy the calendar ID under Integrate Calendar.

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/avongard/discord-calendar-bot.git
   cd your-repo-name
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

4. Modify the `config.json` file with the following:
   1. Discord Token
   2. Server ID
   3. Google Calendar ID's
   4. Google Calendar Label's  

## Usage

1. Start the bot:
   ```bash
   npm start
   ```

2. In 3 minutes the events will be populated. They will also auto sync every 3 minutes.

## Running 24/7

To keep the bot online continuously, consider:
- Using [PM2](https://pm2.keymetrics.io/) to manage the process and auto-restart on crash or reboot

## Stack

- [discord.js](https://discord.js.org/)
- [Google Cloud Console](https://console.cloud.google.com)
- [Google Calendar](https://workspace.google.com/intl/en-US/products/calendar/)

## Notes

- This repo will maintain development.
- If there are any issues, please let me know.
- I hope you enjoy.
