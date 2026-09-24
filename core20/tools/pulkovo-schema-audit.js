#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const file=process.argv[2];
if(!file){console.error('Usage: node tools/pulkovo-schema-audit.js PATH/satsdat.dat');process.exit(2)}
const lines=fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean);
function p52(l){return{satNo:l.slice(0,1).trim(),obsDate:l.slice(2,18).trim(),RAh:l.slice(19,21).trim(),RAm:l.slice(22,24).trim(),RAs:l.slice(25,31).trim(),DEsign:l.slice(32,33).trim(),DEd:l.slice(33,35).trim(),DEm:l.slice(36,38).trim(),DEs:l.slice(39,44).trim()}}
function p50(l){return{satNo:l.slice(0,1).trim(),obsDate:l.slice(2,19).trim(),RAh:l.slice(20,22).trim(),RAm:l.slice(23,25).trim(),RAs:l.slice(26,32).trim(),DEsign:l.slice(33,34).trim(),DEd:l.slice(34,36).trim(),DEm:l.slice(37,39).trim(),DEs:l.slice(40,45).trim()}}
const profile=(lines[0]?.length||0)<80?'J/other/SoSyR/52.312 satsdat fixed-width':'J/other/SoSyR/50.344 or 49.383 satsdat fixed-width';
const samples=lines.slice(0,5).map(l=>(l.length<80?p52(l):p50(l)));
console.log(JSON.stringify({file:path.basename(file),profile,rowCount:lines.length,samples,
  physicalGate:{
    satelliteRADEC:'DIRECT TOPOCENTRIC OBSERVATION',
    jupiterRelativeX:'NOT PRESENT IN SATSDAT',
    status:'NOT ENGINE-ELIGIBLE YET',
    reason:'Recovery requires signed Jupiter-relative displacement. Do not manufacture it from O-C residuals or ephemeris-derived Jupiter positions.'
  }},null,2));
