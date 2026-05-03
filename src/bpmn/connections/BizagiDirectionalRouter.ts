/**
 * BizagiDirectionalRouter.ts
 * Traducción directa de DirectionalRouter y BaseRouter de Bizagi, y Geometry de Crainiate.
 */

export type Face = 'top' | 'bottom' | 'left' | 'right';

export type Point = {
  x: number;
  y: number;
};

export interface RouterObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class BizagiDirectionalRouter {
  private padding: Point = { x: 13, y: 13 };
  private solution: Point[] = [];
  private startPoint!: Point;
  private endPoint!: Point;
  private startDirection!: Face;
  private endDirection!: Face;
  private obstacles: RouterObstacle[] = [];

  public calculateRoute(
    start: Point,
    end: Point,
    startDir: Face,
    endDir: Face,
    obstacles: RouterObstacle[],
    existingWaypoints?: Point[]
  ): Point[] {
    this.startPoint = start;
    this.endPoint = end;
    this.startDirection = startDir;
    this.endDirection = endDir;

    // Inflar obstáculos matemáticamente antes de calcular las intersecciones (Corrección 4)
    this.obstacles = obstacles.map(o => ({
      x: o.x - this.padding.x,
      y: o.y - this.padding.y,
      width: o.width + this.padding.x * 2,
      height: o.height + this.padding.y * 2
    }));

    if (existingWaypoints && existingWaypoints.length > 3) {
      const list = existingWaypoints.map(p => ({ x: p.x, y: p.y }));
      
      // Adaptar primer y último segmento a la nueva posición (preservar route de C# CalculateRoute)
      if (list[0].x !== this.startPoint.x || list[0].y !== this.startPoint.y) {
        if (list[0].x === list[1].x) {
          list[1] = { x: this.startPoint.x, y: list[1].y };
        } else {
          list[1] = { x: list[1].x, y: this.startPoint.y };
        }
        list[0] = { ...this.startPoint };
      }
      
      const last = list.length - 1;
      if (list[last].x !== this.endPoint.x || list[last].y !== this.endPoint.y) {
        if (list[last].x === list[last - 1].x) {
          list[last - 1] = { x: this.endPoint.x, y: list[last - 1].y };
        } else {
          list[last - 1] = { x: list[last - 1].x, y: this.endPoint.y };
        }
        list[last] = { ...this.endPoint };
      }

      this.refinePoints(list);
      
      if (this.isSolutionValid(list, this.startPoint, this.endPoint)) {
        this.calculateSolution(); // Genera the fallback option
        if (list.length <= this.solution.length) {
          this.solution = list;
        }
        return this.solution;
      }
    }

    this.calculateSolution();
    return this.solution;
  }

  private calculateSolution(): void {
    this.buildInitialSolution();
    this.verifySolutionPoints();
    this.verifySolutionLines();
    this.refineSolution();
    this.refinePoints(this.solution);
  }

  private buildInitialSolution(): void {
    this.solution = [];
    this.solution.push({ ...this.startPoint });

    const p = this.padding;
    const sP = this.startPoint;
    const eP = this.endPoint;

    if (this.startDirection === this.endDirection) {
      switch (this.startDirection) {
        case 'right':
          if (sP.x > eP.x) {
            this.solution.push({ x: sP.x + p.x, y: sP.y });
            this.solution.push({ x: sP.x + p.x, y: eP.y });
          } else {
            this.solution.push({ x: eP.x + p.x, y: sP.y });
            this.solution.push({ x: eP.x + p.x, y: eP.y });
          }
          break;
        case 'left':
          if (sP.x < eP.x) {
            this.solution.push({ x: sP.x - p.x, y: sP.y });
            this.solution.push({ x: sP.x - p.x, y: eP.y });
          } else {
            this.solution.push({ x: eP.x - p.x, y: sP.y });
            this.solution.push({ x: eP.x - p.x, y: eP.y });
          }
          break;
        case 'top':
          if (sP.y < eP.y) {
            this.solution.push({ x: sP.x, y: sP.y - p.y });
            this.solution.push({ x: eP.x, y: sP.y - p.y });
          } else {
            this.solution.push({ x: sP.x, y: eP.y - p.y });
            this.solution.push({ x: eP.x, y: eP.y - p.y });
          }
          break;
        case 'bottom':
          if (sP.y > eP.y) {
            this.solution.push({ x: sP.x, y: sP.y + p.y });
            this.solution.push({ x: eP.x, y: sP.y + p.y });
          } else {
            this.solution.push({ x: sP.x, y: eP.y + p.y });
            this.solution.push({ x: eP.x, y: eP.y + p.y });
          }
          break;
      }
    } else if (this.startDirection === 'left' || this.startDirection === 'right') {
      if (this.endDirection === 'left' || this.endDirection === 'right') {
        if (sP.y !== eP.y) {
          const num = eP.x - sP.x;
          this.solution.push({ x: sP.x + num / 2, y: sP.y });
          this.solution.push({ x: sP.x + num / 2, y: eP.y });
        }
      } else {
        this.solution.push({ x: eP.x, y: sP.y });
      }
    } else if (this.endDirection === 'top' || this.endDirection === 'bottom') {
      if (sP.x !== eP.x) {
        const num2 = eP.y - sP.y;
        this.solution.push({ x: sP.x, y: sP.y + num2 / 2 });
        this.solution.push({ x: eP.x, y: sP.y + num2 / 2 });
      }
    } else {
      this.solution.push({ x: sP.x, y: eP.y });
    }
    
    this.solution.push({ ...this.endPoint });
  }

  private isSolutionValid(list: Point[], start: Point, end: Point): boolean {
    if (!list || list.length < 2) return false;
    if (list[0].x !== start.x || list[0].y !== start.y) return false;
    const last = list[list.length - 1];
    if (last.x !== end.x || last.y !== end.y) return false;

    for (let i = 1; i < list.length; i++) {
      const p1 = list[i - 1];
      const p2 = list[i];
      if (i < list.length - 1 && this.getShapeFromPoint(p2.x, p2.y) !== null) {
        return false;
      }
      if (this.getIntersectedShapes(p1, p2).length !== 0) {
        return false;
      }
    }
    return true;
  }

  private verifySolutionPoints(): void {
    for (let i = 2; i < this.solution.length; i++) {
      const pointF = this.solution[i - 1];
      const shapeFromPoint = this.getShapeFromPoint(pointF.x, pointF.y);
      if (!shapeFromPoint) continue;

      const pointF2 = this.solution[i - 2];
      const pointF3 = this.solution[i];
      let x = 0, y = 0;

      if (pointF2.y === pointF.y) {
        x = (pointF2.x <= shapeFromPoint.x) ? (shapeFromPoint.x - 1) : (shapeFromPoint.x + shapeFromPoint.width + 1);
        y = (pointF3.y <= shapeFromPoint.y) ? (shapeFromPoint.y - 1) : (shapeFromPoint.y + shapeFromPoint.height + 1);
      } else {
        x = (pointF3.x <= shapeFromPoint.x) ? (shapeFromPoint.x - 1) : (shapeFromPoint.x + shapeFromPoint.width + 1);
        y = (pointF2.y <= shapeFromPoint.y) ? (shapeFromPoint.y - 1) : (shapeFromPoint.y + shapeFromPoint.height + 1);
      }

      if (this.getShapeFromPoint(x, y) !== null) continue;

      if (pointF2.y === pointF.y) {
        if (this.getShapeFromPoint(pointF3.x, y) === null && this.getShapeFromPoint(x, pointF2.y) === null) {
          this.solution.splice(i - 1, 1,
            { x: pointF3.x, y },
            { x, y },
            { x, y: pointF2.y }
          );
        }
      } else if (this.getShapeFromPoint(x, pointF3.y) === null && this.getShapeFromPoint(pointF2.x, y) === null) {
        this.solution.splice(i - 1, 1,
          { x, y: pointF3.y },
          { x, y },
          { x: pointF2.x, y }
        );
      }
    }
  }

  private verifySolutionLines(): void {
    for (let i = 1; i < this.solution.length; i++) {
      const startPoint = this.solution[i - 1];
      const endPoint = this.solution[i];
      const intersectedShapes = this.getIntersectedShapes(startPoint, endPoint);
      if (intersectedShapes.length === 0) continue;

      let num = 0, num2 = 0, num3 = 0, num4 = 0;
      for (let j = 0; j < intersectedShapes.length; j++) {
        const shape = intersectedShapes[j];
        if (j === 0) {
          num = shape.x;
          num2 = shape.y;
          num3 = num + shape.width;
          num4 = num2 + shape.height;
          continue;
        }
        if (num > shape.x) num = shape.x;
        if (num2 > shape.y) num2 = shape.y;
        if (num3 < shape.x + shape.width) num3 = shape.x + shape.width;
        if (num4 < shape.y + shape.height) num4 = shape.y + shape.height;
      }

      let pointF: Point, pointF2: Point, pointF3: Point, pointF4: Point;

      if (startPoint.x === endPoint.x) {
        const x = (startPoint.x - num < num3 - startPoint.x) ? (num - 1) : (num3 + 1);
        pointF = { x: startPoint.x, y: (startPoint.y < endPoint.y) ? (num2 - 1) : (num4 + 1) };
        pointF2 = { x, y: (startPoint.y < endPoint.y) ? (num2 - 1) : (num4 + 1) };
        pointF3 = { x, y: (startPoint.y < endPoint.y) ? (num4 + 1) : (num2 - 1) };
        pointF4 = { x: startPoint.x, y: (startPoint.y < endPoint.y) ? (num4 + 1) : (num2 - 1) };
      } else {
        const y = (num4 - startPoint.y < startPoint.y - num2) ? (num4 + 1) : (num2 - 1);
        pointF = { x: (startPoint.x < endPoint.x) ? (num - 1) : (num3 + 1), y: startPoint.y };
        pointF2 = { x: (startPoint.x < endPoint.x) ? (num - 1) : (num3 + 1), y };
        pointF3 = { x: (startPoint.x < endPoint.x) ? (num3 + 1) : (num - 1), y };
        pointF4 = { x: (startPoint.x < endPoint.x) ? (num3 + 1) : (num - 1), y: startPoint.y };
      }

      let flag = true;
      if (this.getShapeFromPoint(pointF.x, pointF.y) || 
          this.getShapeFromPoint(pointF2.x, pointF2.y) || 
          this.getShapeFromPoint(pointF3.x, pointF3.y) || 
          this.getShapeFromPoint(pointF4.x, pointF4.y)) {
        flag = false;
      }
      if (this.getIntersectedShapes(pointF, pointF2).length !== 0 || 
          this.getIntersectedShapes(pointF2, pointF3).length !== 0 || 
          this.getIntersectedShapes(pointF3, pointF4).length !== 0) {
        flag = false;
      }

      if (flag) {
        this.solution.splice(i, 0, pointF, pointF2, pointF3, pointF4);
        i += 4;
      }
    }
  }

  private refineSolution(): void {
    for (let num = 1; num < this.solution.length - 3; num = (num <= 0 ? 1 : num + 1)) {
      const p1 = this.solution[num - 1];
      const p2 = this.solution[num];
      const p3 = this.solution[num + 1];
      const p4 = this.solution[num + 2];
      const p5 = this.solution[num + 3];

      const dir1 = this.getLineDirection(p1, p2);
      const dir2 = this.getLineDirection(p2, p3);
      const dir3 = this.getLineDirection(p3, p4);
      const dir4 = this.getLineDirection(p4, p5);

      const len1 = this.getLineLength(p1, p2);
      const len2 = this.getLineLength(p2, p3);
      const len3 = this.getLineLength(p3, p4);
      const len4 = this.getLineLength(p4, p5);

      const isVertical1 = p1.x === p2.x;

      if (dir1 === dir3) {
        if (dir2 === dir4) {
          if (isVertical1) {
            const newPoint = { x: p1.x, y: p4.y };
            if (this.changeCorner(num, newPoint)) num--;
          } else {
            const newPoint = { x: p4.x, y: p1.y };
            if (this.changeCorner(num, newPoint)) num--;
          }
        } else if (len2 === len4) {
          if (isVertical1) {
            const newPoint = { x: p1.x, y: p4.y };
            if (this.changeCorner(num, newPoint)) {
              this.solution.splice(num, 2);
              num -= 2;
            }
          } else {
            const newPoint = { x: p4.x, y: p1.y };
            if (this.changeCorner(num, newPoint)) {
              this.solution.splice(num, 2);
              num -= 2;
            }
          }
        } else if (len4 > len2) {
          if (isVertical1) {
            const newPoint = { x: p1.x, y: p4.y };
            if (this.changeCorner(num, newPoint)) num -= 2;
          } else {
            const newPoint = { x: p4.x, y: p1.y };
            if (this.changeCorner(num, newPoint)) num -= 2;
          }
        } else if (len2 > len4 && num < this.solution.length - 4) {
          if (isVertical1) {
            const newPoint = { x: p5.x, y: p2.y };
            if (this.changeCorner(num + 1, newPoint)) num -= 2;
          } else {
            const newPoint = { x: p2.x, y: p5.y };
            if (this.changeCorner(num + 1, newPoint)) num -= 2;
          }
        }
      } else if (dir2 === dir4) {
        if (len1 > len3) {
          if (isVertical1) {
            const newPoint = { x: p1.x, y: p4.y };
            if (this.changeCorner(num, newPoint)) num -= 2;
          } else {
            const newPoint = { x: p4.x, y: p1.y };
            if (this.changeCorner(num, newPoint)) num -= 2;
          }
        } else if (len3 > len1 && num > 1) {
          if (isVertical1) {
            const newPoint = { x: p3.x, y: p1.y };
            if (this.changeCorner(num - 1, newPoint)) num -= 2;
          } else {
            const newPoint = { x: p1.x, y: p3.y };
            if (this.changeCorner(num - 1, newPoint)) num -= 2;
          }
        }
      }
    }
  }

  private changeCorner(index: number, newPoint: Point): boolean {
    if (this.getShapeFromPoint(newPoint.x, newPoint.y) === null) {
      if (index - 1 < 0 || index + 3 > this.solution.length - 1) return false;
      const startPoint = this.solution[index - 1];
      const endPoint = this.solution[index + 3];
      const intersected1 = this.getIntersectedShapes(startPoint, newPoint);
      const intersected2 = this.getIntersectedShapes(newPoint, endPoint);
      if (intersected1.length === 0 && intersected2.length === 0) {
        this.solution.splice(index, 3, newPoint);
        return true;
      }
    }
    return false;
  }

  private refinePoints(points: Point[]): void {
    if (!points || points.length <= 2) return;
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const p3 = points[i + 1];
      if ((p1.x === p2.x && p2.x === p3.x) || (p1.y === p2.y && p2.y === p3.y)) {
        points.splice(i, 1);
        i--;
      }
    }
  }

  private getShapeFromPoint(x: number, y: number): RouterObstacle | null {
    for (const shape of this.obstacles) {
      if (x >= shape.x && x <= shape.x + shape.width &&
          y >= shape.y && y <= shape.y + shape.height) {
        return shape;
      }
    }
    return null;
  }

  private getIntersectedShapes(startPoint: Point, endPoint: Point): RouterObstacle[] {
    const arr: RouterObstacle[] = [];
    for (const value of this.obstacles) {
      if (startPoint.y === endPoint.y && startPoint.y >= value.y && startPoint.y <= value.y + value.height) {
        if ((startPoint.x <= value.x && endPoint.x >= value.x + value.width) ||
            (endPoint.x <= value.x && startPoint.x >= value.x + value.width)) {
          arr.push(value);
        }
      } else if (startPoint.x === endPoint.x && startPoint.x >= value.x && startPoint.x <= value.x + value.width) {
        if ((startPoint.y <= value.y && endPoint.y >= value.y + value.height) ||
            (endPoint.y <= value.y && startPoint.y >= value.y + value.height)) {
          arr.push(value);
        }
      }
    }
    return arr;
  }

  private getLineDirection(p1: Point, p2: Point): number {
    if (p1.y === p2.y) return p1.x < p2.x ? 1 : 3;
    return p1.y < p2.y ? 2 : 4;
  }

  private getLineLength(p1: Point, p2: Point): number {
    return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
  }
}
