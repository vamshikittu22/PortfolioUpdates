import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { provider, key } = await request.json();

    if (!provider || typeof key !== 'string') {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    const envPath = path.join(process.cwd(), '.env.local');
    let envContent = '';

    // Read existing .env.local if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    const envKeyName = `${provider.toUpperCase()}_API_KEY`;
    const regex = new RegExp(`^${envKeyName}=.*$`, 'm');

    if (envContent.match(regex)) {
      // Replace existing key
      envContent = envContent.replace(regex, `${envKeyName}=${key}`);
    } else {
      // Append new key
      envContent += `\n${envKeyName}=${key}`;
    }

    // Clean up empty lines
    envContent = envContent.replace(/\n{3,}/g, '\n\n').trim();

    // Write back to .env.local
    fs.writeFileSync(envPath, envContent, 'utf8');

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Failed to save API key to .env.local', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
