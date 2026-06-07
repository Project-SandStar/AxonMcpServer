/**
 * Prisma-backed OAuth clients store for MCP SDK OAuth 2.1
 * Implements OAuthRegisteredClientsStore interface
 */

import { PrismaClient } from '../generated/prisma/client.js';
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { generateClientId, generateClientSecret } from './tokenUtils.js';

export class PrismaClientsStore implements OAuthRegisteredClientsStore {
  private defaultScopes: string[];

  constructor(prisma: PrismaClient, defaultScopes: string[] = ['mcp:read', 'mcp:write']) {
    this.prisma = prisma;
    this.defaultScopes = defaultScopes;
  }

  private prisma: PrismaClient;

  /**
   * Get a registered OAuth client by client_id
   */
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) {
      return undefined;
    }

    return this.dbClientToOAuthClient(client);
  }

  /**
   * Register a new OAuth client (Dynamic Client Registration)
   */
  async registerClient(
    clientMetadata: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>
  ): Promise<OAuthClientInformationFull> {
    const clientId = generateClientId();
    const clientSecret = generateClientSecret();
    const issuedAt = Math.floor(Date.now() / 1000);

    // Use provided scope or default to all supported scopes
    const scope = clientMetadata.scope || this.defaultScopes.join(' ');

    const client = await this.prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecret,
        clientName: clientMetadata.client_name || null,
        redirectUris: JSON.stringify(clientMetadata.redirect_uris),
        scope,
      },
    });

    return {
      ...clientMetadata,
      client_id: client.clientId,
      client_secret: client.clientSecret || undefined,
      client_id_issued_at: issuedAt,
      scope, // Include scope in response
    };
  }

  /**
   * Delete an OAuth client
   */
  async deleteClient(clientId: string): Promise<boolean> {
    try {
      await this.prisma.oAuthClient.delete({
        where: { clientId },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all registered OAuth clients
   */
  async getAllClients(): Promise<OAuthClientInformationFull[]> {
    const clients = await this.prisma.oAuthClient.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return clients.map((client) => this.dbClientToOAuthClient(client));
  }

  /**
   * Convert database client to OAuth client format
   */
  private dbClientToOAuthClient(client: {
    clientId: string;
    clientSecret: string | null;
    clientName: string | null;
    redirectUris: string;
    scope: string | null;
    createdAt: Date;
  }): OAuthClientInformationFull {
    return {
      client_id: client.clientId,
      client_secret: client.clientSecret || undefined,
      client_name: client.clientName || undefined,
      redirect_uris: JSON.parse(client.redirectUris) as string[],
      scope: client.scope || undefined,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    };
  }
}
