import React from 'react';
//import type { AppProps } from 'next/app';

import '../styles/globals.css';
const {app, BrowserWindow} = require('electron')
const url = require('url')
const path = require('path')

let win

// Set the path where recordings will be saved
//app.setPath("Desktop", __dirname + "/saved_recordings")

function createWindow() {
   win = new BrowserWindow({width: 800, height: 600})
   win.loadURL(url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true
   }))
}

//app.on('ready', createWindow)


function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

export default MyApp
