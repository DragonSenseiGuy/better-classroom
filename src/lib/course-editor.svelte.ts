import type { CourseRef } from '#lib/course.ts';

export const courseEditor = $state<{ course: CourseRef | null }>({ course: null });

export const editCourse = (course: CourseRef) => {
	courseEditor.course = course;
};
