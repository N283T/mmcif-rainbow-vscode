import * as vscode from 'vscode';

/**
 * Centralized logger for the mmCIF Rainbow extension.
 * Uses VSCode OutputChannel instead of console.log for production-ready logging.
 */
export class Logger {
    private static instance: Logger | undefined;
    private outputChannel: vscode.OutputChannel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('mmCIF Rainbow');
    }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Get the output channel for registration as a disposable
     */
    getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    /**
     * Log an info message
     */
    info(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [INFO] ${message}`);
    }

    /**
     * Log a warning message
     */
    warn(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [WARN] ${message}`);
    }

    /**
     * Log an error message
     */
    error(message: string, error?: unknown): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [ERROR] ${message}`);
        if (error instanceof Error) {
            this.outputChannel.appendLine(`  Stack: ${error.stack}`);
        } else if (error !== undefined) {
            this.outputChannel.appendLine(`  Details: ${String(error)}`);
        }
    }

    /**
     * Log a debug message (only in development)
     */
    debug(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [DEBUG] ${message}`);
    }

    /**
     * Show the output channel in the UI
     */
    show(): void {
        this.outputChannel.show();
    }

    /**
     * Dispose the logger (called on extension deactivation)
     */
    dispose(): void {
        this.outputChannel.dispose();
        Logger.instance = undefined;
    }
}
