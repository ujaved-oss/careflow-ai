import {sqliteTable,integer,text} from 'drizzle-orm/sqlite-core';
export const workspace=sqliteTable('team_workspace',{id:integer('id').primaryKey(),ownerId:text('owner_id').notNull(),revision:integer('revision').notNull().default(0),data:text('data').notNull()});
export const sessions=sqliteTable('team_sessions',{tokenHash:text('token_hash').primaryKey(),principalId:text('principal_id').notNull(),personId:text('person_id').notNull(),expiresAt:integer('expires_at').notNull()});
