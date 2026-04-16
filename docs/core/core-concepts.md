---
title: Core Concepts
description: The four design principles and a technical overview of how BarefootJS works
---

# Core Concepts

BarefootJS compiles JSX into server templates and minimal client JS for any backend. No SPA framework, no Node.js lock-in.

## Backend Freedom

Server rendering with JSX usually means running Node.js. BarefootJS compiles JSX to native templates for Hono, Go `html/template`, or any custom adapter — no Node.js at serving time.

## MPA-style Development

Components render to static HTML by default. `"use client"` marks those that need interactivity — only they ship JavaScript. Your routing, data fetching, and templates don't change.

## Fine-grained Reactivity

The compiler analyzes which DOM nodes depend on which signals and generates code that connects them. When state changes, only the affected node updates — no virtual DOM, no component re-render.

## AI-native Development

Component tests run in milliseconds against the compiler's IR — no browser needed. The `barefoot` CLI provides structured component discovery for humans and AI agents.

## How It Works

Two-phase compilation, hydration markers, and CSS layer overrides — a technical deep-dive.
