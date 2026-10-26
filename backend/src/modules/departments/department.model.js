import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** A part of the organization (e.g. Engineering) led by a department head; holds teams. */
export class Department extends Model {}

Department.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.STRING(300), allowNull: true },
    /** A member of the organization chosen by an organization admin. */
    headId: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Department',
    tableName: 'departments',
    indexes: [{ unique: true, fields: ['organization_id', 'name'] }],
  },
);

/** A group of people inside a department, with a team lead. */
export class Team extends Model {}

Team.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    departmentId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.STRING(300), allowNull: true },
    /** Always one of the team's members. */
    leadId: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Team',
    tableName: 'teams',
    indexes: [{ unique: true, fields: ['department_id', 'name'] }, { fields: ['organization_id'] }],
  },
);

export class TeamMember extends Model {}

TeamMember.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    teamId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
  },
  {
    sequelize,
    modelName: 'TeamMember',
    tableName: 'team_members',
    indexes: [{ unique: true, fields: ['team_id', 'user_id'] }, { fields: ['user_id'] }],
  },
);
