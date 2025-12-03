import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    HttpStatus,
    BadRequestException,
    NotFoundException,
    UnauthorizedException,
    ConflictException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiParam, ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';

@ApiTags('Departments')
@Controller('departments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class DepartmentsController {
    constructor(
        private readonly usersService: UsersService,
        private readonly prisma: PrismaService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Get all departments' })
    @ApiOkResponse({
        description: 'List of departments retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string', example: 'Departments retrieved successfully' },
                departments: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', example: 'dept-it' },
                            name: { type: 'string', example: 'IT Department' },
                            description: { type: 'string', example: 'Information Technology Department' },
                            isActive: { type: 'boolean', example: true },
                        },
                    },
                },
            },
        },
    })
    @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
    @ApiQuery({ name: 'search', required: false, type: String, description: 'Search departments by name or description' })
    async getAllDepartments(
        @Query('isActive') isActive?: boolean,
        @Query('search') search?: string,
    ) {
        const whereClause: any = {};

        if (isActive !== undefined) {
            // Convert string to boolean if needed
            whereClause.isActive = typeof isActive === 'string' ? isActive === 'true' : isActive;
        }

        if (search) {
            whereClause.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        const departments = await this.prisma.department.findMany({
            where: whereClause,
            select: { 
                id: true, 
                name: true, 
                description: true, 
                isActive: true,
                _count: {
                    select: {
                        users: true,
                        documents: true,
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        // Transform the response to flatten _count
        const transformedDepartments = departments.map(dept => ({
            id: dept.id,
            name: dept.name,
            description: dept.description,
            isActive: dept.isActive,
            members: dept._count.users,
            documents: dept._count.documents,
        }));

        return {
            message: 'Departments retrieved successfully',
            departments: transformedDepartments,
        };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get department by ID' })
    @ApiParam({ name: 'id', description: 'Department ID' })
    @ApiOkResponse({
        description: 'Department retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string', example: 'Department retrieved successfully' },
                department: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', example: 'dept-it' },
                        name: { type: 'string', example: 'IT Department' },
                        description: { type: 'string', example: 'Information Technology Department' },
                        isActive: { type: 'boolean', example: true },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
            },
        },
    })
    async getDepartmentById(@Param('id') id: string) {
        const department = await this.prisma.department.findUnique({
            where: { id },
        });

        if (!department) {
            throw new NotFoundException('Department not found');
        }

        return {
            message: 'Department retrieved successfully',
            department,
        };
    }

    @Get(':id/users')
    @ApiOperation({ summary: 'Get all users in a department' })
    @ApiParam({ name: 'id', description: 'Department ID' })
    @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
    @ApiOkResponse({
        description: 'Users retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string', example: 'Department users retrieved successfully' },
                users: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            email: { type: 'string' },
                            firstName: { type: 'string' },
                            lastName: { type: 'string' },
                            isActive: { type: 'boolean' },
                            role: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    name: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                total: { type: 'number', example: 5 },
            },
        },
    })
    async getDepartmentUsers(
        @Param('id') id: string,
        @Query('isActive') isActive?: boolean,
    ) {
        // Check if department exists
        const department = await this.prisma.department.findUnique({
            where: { id },
            select: { id: true, name: true },
        });

        if (!department) {
            throw new NotFoundException('Department not found');
        }

        // Build where clause
        const where: any = { departmentId: id };

        if (isActive !== undefined) {
            // Convert string to boolean if needed
            where.isActive = typeof isActive === 'string' ? isActive === 'true' : isActive;
        }

        // Get users with pagination
        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    username: true,
                    isActive: true,
                    role: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
                orderBy: { lastName: 'asc' },
            }),
            this.prisma.user.count({ where }),
        ]);

        return {
            message: 'Department users retrieved successfully',
            department: department.name,
            users,
            total,
        };
    }

    @Get(':id/documents')
    @ApiOperation({ summary: 'Get all documents in a department' })
    @ApiParam({ name: 'id', description: 'Department ID' })
    @ApiOkResponse({
        description: 'Documents retrieved successfully',
    })
    async getDepartmentDocuments(@Param('id') id: string) {
        // Check if department exists
        const department = await this.prisma.department.findUnique({
            where: { id },
            select: { id: true, name: true },
        });

        if (!department) {
            throw new NotFoundException('Department not found');
        }

        // Get documents
        const documents = await this.prisma.document.findMany({
            where: { departmentId: id },
            include: {
                creator: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                tags: {
                    include: {
                        tag: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return {
            message: 'Department documents retrieved successfully',
            department: department.name,
            documents,
            total: documents.length,
        };
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    @ApiOperation({ summary: 'Create a new department' })
    @ApiBody({ type: CreateDepartmentDto })
    @ApiCreatedResponse({
        description: 'Department created successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string', example: 'Department created successfully' },
                department: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', example: 'dept-it' },
                        name: { type: 'string', example: 'IT Department' },
                        description: { type: 'string', example: 'Information Technology Department' },
                        isActive: { type: 'boolean', example: true },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
            },
        },
    })
    async createDepartment(@Body() createDepartmentDto: CreateDepartmentDto) {
        // Check if department with the same name already exists
        const existingDepartment = await this.prisma.department.findUnique({
            where: { name: createDepartmentDto.name },
        });

        if (existingDepartment) {
            throw new ConflictException('Department with this name already exists');
        }

        // Create department
        const department = await this.prisma.department.create({
            data: {
                name: createDepartmentDto.name,
                description: createDepartmentDto.description,
                isActive: createDepartmentDto.isActive ?? true,
            },
        });

        return {
            message: 'Department created successfully',
            department,
        };
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    @ApiOperation({ summary: 'Update a department' })
    @ApiParam({ name: 'id', description: 'Department ID' })
    @ApiBody({ type: UpdateDepartmentDto })
    @ApiOkResponse({
        description: 'Department updated successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string', example: 'Department updated successfully' },
                department: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', example: 'dept-it' },
                        name: { type: 'string', example: 'IT Department' },
                        description: { type: 'string', example: 'Information Technology Department' },
                        isActive: { type: 'boolean', example: true },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
            },
        },
    })
    async updateDepartment(
        @Param('id') id: string,
        @Body() updateDepartmentDto: UpdateDepartmentDto,
    ) {
        // Check if department exists
        const department = await this.prisma.department.findUnique({
            where: { id },
        });

        if (!department) {
            throw new NotFoundException('Department not found');
        }

        // Check if name is being updated and if it's already taken
        if (updateDepartmentDto.name && updateDepartmentDto.name !== department.name) {
            const existingDepartment = await this.prisma.department.findUnique({
                where: { name: updateDepartmentDto.name },
            });

            if (existingDepartment) {
                throw new ConflictException('Department with this name already exists');
            }
        }

        // Update department
        const updatedDepartment = await this.prisma.department.update({
            where: { id },
            data: {
                name: updateDepartmentDto.name,
                description: updateDepartmentDto.description,
                isActive: updateDepartmentDto.isActive,
            },
        });

        return {
            message: 'Department updated successfully',
            department: updatedDepartment,
        };
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    @ApiOperation({ summary: 'Delete a department' })
    @ApiParam({ name: 'id', description: 'Department ID' })
    @ApiOkResponse({
        description: 'Department deleted successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string', example: 'Department deleted successfully' },
            },
        },
    })
    async deleteDepartment(@Param('id') id: string) {
        // Check if department exists
        const department = await this.prisma.department.findUnique({
            where: { id },
            include: {
                users: { select: { id: true } },
                documents: { select: { id: true } },
            },
        });

        if (!department) {
            throw new NotFoundException('Department not found');
        }

        // Check if department has users or documents
        if (department.users.length > 0 || department.documents.length > 0) {
            throw new BadRequestException('Cannot delete department with associated users or documents');
        }

        // Delete department
        await this.prisma.department.delete({
            where: { id },
        });

        return {
            message: 'Department deleted successfully',
        };
    }
}