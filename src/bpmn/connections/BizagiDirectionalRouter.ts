/**
 * BizagiDirectionalRouter.ts
 *
 * Traducción directa de DirectionalRouter.cs y BaseRouter.cs de Bizagi Modeler.
 *
 * PRINCIPIOS DE DISEÑO (aprendidos de los fuentes C#):
 *  1. El router es ciego a la forma visual — TODO obstáculo es un rectángulo ortogonal.
 *     La geometría diagonal de un Gateway (rombo) la maneja BizagiConnectionDocking.ts.
 *  2. La zona de "exclusión" alrededor de cada figura es el Bounding Box expandido por
 *     `padding` (13px). Las desigualdades son ESTRICTAS (< >) para evitar colisiones
 *     falsas en milímetros fronterizos que destruyen la línea (el "Beso de la Muerte").
 *  3. El "Pixel de Escape" (+ 1 / - 1) viene directamente de BaseRouter.cs: al empujar
 *     un codo o un bypass hacia afuera de la zona de exclusión, se suma 1 px extra para
 *     que el nuevo punto caiga claramente dentro de la zona SEGURA (< padding), evitando
 *     que el algoritmo entre en un bucle de colisión infinita.
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
    existingWaypoints?: Point[],
    prevStartDir?: Face,
    prevEndDir?: Face
  ): Point[] {
    this.startPoint = start;
    this.endPoint = end;
    this.startDirection = startDir;
    this.endDirection = endDir;
    this.obstacles = obstacles;

    /**
     * Preservación de waypoints durante drag — equivalente a DirectionalRouter.CalculateRoute (C#).
     *
     * El C# tiene dos guardas críticas antes de adaptar:
     *   1. `list.Count > 3` — solo si hay suficientes puntos
     *   2. `startDirection.Direction == StartDirection.Direction` — SOLO si la cara de salida
     *      NO cambió tras recalcular. Si la cara cambió (ej: el shape cruzó al otro lado),
     *      descarta los waypoints y recalcula desde cero.
     *
     * En TS: `prevStartDir/prevEndDir` son las caras del layout anterior. Si no coinciden
     * con `startDir/endDir` actuales, no intentamos adaptar.
     */
    if (existingWaypoints && existingWaypoints.length > 3) {
      const startDirUnchanged = !prevStartDir || prevStartDir === startDir;
      const endDirUnchanged   = !prevEndDir   || prevEndDir   === endDir;

      const list = existingWaypoints.map(p => ({ x: p.x, y: p.y }));

      // Adaptar primer segmento — solo si la cara de salida no cambió
      if (startDirUnchanged &&
          (list[0].x !== this.startPoint.x || list[0].y !== this.startPoint.y)) {
        // C#: RemoveAt(1) luego Insert(1, new PointF(startDir.X, list[1].Y))
        // Tras el remove, list[1] es el que era list[2] → replicamos con splice
        if (list[0].x === list[1].x) {
          // Primer segmento vertical → nuevo codo usa X del nuevo start
          list.splice(1, 1, { x: this.startPoint.x, y: list[2]?.y ?? list[1].y });
        } else {
          // Primer segmento horizontal → nuevo codo usa Y del nuevo start
          list.splice(1, 1, { x: list[2]?.x ?? list[1].x, y: this.startPoint.y });
        }
        list[0] = { ...this.startPoint };
      }

      // Adaptar último segmento — solo si la cara de entrada no cambió
      if (endDirUnchanged) {
        const last = list.length - 1;
        if (list[last].x !== this.endPoint.x || list[last].y !== this.endPoint.y) {
          if (list[last].x === list[last - 1].x) {
            list.splice(last - 1, 1, { x: this.endPoint.x, y: list[last - 2]?.y ?? list[last - 1].y });
          } else {
            list.splice(last - 1, 1, { x: list[last - 2]?.x ?? list[last - 1].x, y: this.endPoint.y });
          }
          list[list.length - 1] = { ...this.endPoint };
        }
      }

      this.refinePoints(list);

      if (this.isSolutionValid(list, this.startPoint, this.endPoint)) {
        this.calculateSolution();
        if (list.length <= this.solution.length) {
          this.solution = list;
        }
        return this.solution;
      }
    }

    this.calculateSolution();
    return this.solution;
  }

  // ── Orquestación principal (DirectionalRouter.cs: CalculateSolution) ──────────

  private calculateSolution(): void {
    this.buildInitialSolution();
    this.verifySolutionPoints();
    this.verifySolutionLines();
    this.refineSolution();
    this.refinePoints(this.solution);
  }

  // ── Generación de ruta inicial en L / Z ───────────────────────────────────────

  private buildInitialSolution(): void {
    this.solution = [];
    this.solution.push({ ...this.startPoint });

    const p = this.padding;
    const sP = this.startPoint;
    const eP = this.endPoint;

    if (this.startDirection === this.endDirection) {
      // Misma dirección: necesitamos un "U-turn" seguro
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
        // Ambas horizontales: ruta en Z con punto medio vertical
        if (sP.y !== eP.y) {
          const midX = sP.x + (eP.x - sP.x) / 2;
          this.solution.push({ x: midX, y: sP.y });
          this.solution.push({ x: midX, y: eP.y });
        }
      } else {
        // Horizontal → Vertical: ruta en L
        this.solution.push({ x: eP.x, y: sP.y });
      }
    } else if (this.endDirection === 'top' || this.endDirection === 'bottom') {
      // Ambas verticales: ruta en Z con punto medio horizontal
      if (sP.x !== eP.x) {
        const midY = sP.y + (eP.y - sP.y) / 2;
        this.solution.push({ x: sP.x, y: midY });
        this.solution.push({ x: eP.x, y: midY });
      }
    } else {
      // Vertical → Horizontal: ruta en L
      this.solution.push({ x: sP.x, y: eP.y });
    }

    this.solution.push({ ...this.endPoint });
  }

  // ── Verificación de validez de la solución ────────────────────────────────────

  private isSolutionValid(list: Point[], start: Point, end: Point): boolean {
    if (!list || list.length < 2) return false;
    if (list[0].x !== start.x || list[0].y !== start.y) return false;
    const last = list[list.length - 1];
    if (last.x !== end.x || last.y !== end.y) return false;

    for (let i = 1; i < list.length; i++) {
      const p1 = list[i - 1];
      const p2 = list[i];
      // Los codos intermedios no deben caer dentro de la zona de exclusión
      if (i < list.length - 1 && this.getShapeFromPoint(p2.x, p2.y) !== null) {
        return false;
      }
      if (this.getIntersectedShapes(p1, p2).length !== 0) {
        return false;
      }
    }
    return true;
  }

  // ── Empuje de codos atrapados dentro de obstáculos ────────────────────────────
  // Equivalente a BaseRouter.cs: VerifySolutionPoints

  private verifySolutionPoints(): void {
    for (let i = 2; i < this.solution.length; i++) {
      const pointF = this.solution[i - 1];
      const shapeFromPoint = this.getShapeFromPoint(pointF.x, pointF.y);
      if (!shapeFromPoint) continue;

      const pointF2 = this.solution[i - 2];
      const pointF3 = this.solution[i];
      let x = 0, y = 0;

      // "Pixel de Escape" (+ 1 / - 1): viene directamente de BaseRouter.cs.
      // Empujamos el codo hasta 1 pixel más allá del borde de la zona de exclusión
      // para que caiga FUERA del rango estricto y no vuelva a ser atrapado.
      if (pointF2.y === pointF.y) {
        x = (pointF2.x <= shapeFromPoint.x)
          ? (shapeFromPoint.x - this.padding.x - 1)
          : (shapeFromPoint.x + shapeFromPoint.width + this.padding.x + 1);
        y = (pointF3.y <= shapeFromPoint.y)
          ? (shapeFromPoint.y - this.padding.y - 1)
          : (shapeFromPoint.y + shapeFromPoint.height + this.padding.y + 1);
      } else {
        x = (pointF3.x <= shapeFromPoint.x)
          ? (shapeFromPoint.x - this.padding.x - 1)
          : (shapeFromPoint.x + shapeFromPoint.width + this.padding.x + 1);
        y = (pointF2.y <= shapeFromPoint.y)
          ? (shapeFromPoint.y - this.padding.y - 1)
          : (shapeFromPoint.y + shapeFromPoint.height + this.padding.y + 1);
      }

      if (this.getShapeFromPoint(x, y) !== null) continue;

      if (pointF2.y === pointF.y) {
        if (this.getShapeFromPoint(pointF3.x, y) === null &&
            this.getShapeFromPoint(x, pointF2.y) === null) {
          this.solution.splice(i - 1, 1,
            { x: pointF3.x, y },
            { x, y },
            { x, y: pointF2.y }
          );
        }
      } else if (this.getShapeFromPoint(x, pointF3.y) === null &&
                 this.getShapeFromPoint(pointF2.x, y) === null) {
        this.solution.splice(i - 1, 1,
          { x, y: pointF3.y },
          { x, y },
          { x: pointF2.x, y }
        );
      }
    }
  }

  // ── Rodeo de segmentos que atraviesan obstáculos ───────────────────────────────
  // Equivalente a BaseRouter.cs: VerifySolutionLines

  private verifySolutionLines(): void {
    for (let i = 1; i < this.solution.length; i++) {
      const startPoint = this.solution[i - 1];
      const endPoint = this.solution[i];
      const intersectedShapes = this.getIntersectedShapes(startPoint, endPoint);
      if (intersectedShapes.length === 0) continue;

      // Calcular el bounding box combinado de todos los obstáculos intersectados
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

      // Calcular los 4 puntos del rodeo (bypass) con Pixel de Escape (+1 / -1)
      let pointF: Point, pointF2: Point, pointF3: Point, pointF4: Point;

      if (startPoint.x === endPoint.x) {
        // Segmento vertical: rodear por izquierda o derecha
        const x = (startPoint.x - num < num3 - startPoint.x)
          ? (num - this.padding.x - 1)
          : (num3 + this.padding.x + 1);
        const yEntry = (startPoint.y < endPoint.y)
          ? (num2 - this.padding.y - 1)
          : (num4 + this.padding.y + 1);
        const yExit = (startPoint.y < endPoint.y)
          ? (num4 + this.padding.y + 1)
          : (num2 - this.padding.y - 1);
        pointF  = { x: startPoint.x, y: yEntry };
        pointF2 = { x, y: yEntry };
        pointF3 = { x, y: yExit };
        pointF4 = { x: startPoint.x, y: yExit };
      } else {
        // Segmento horizontal: rodear por arriba o abajo
        const y = (num4 - startPoint.y < startPoint.y - num2)
          ? (num4 + this.padding.y + 1)
          : (num2 - this.padding.y - 1);
        const xEntry = (startPoint.x < endPoint.x)
          ? (num - this.padding.x - 1)
          : (num3 + this.padding.x + 1);
        const xExit = (startPoint.x < endPoint.x)
          ? (num3 + this.padding.x + 1)
          : (num - this.padding.x - 1);
        pointF  = { x: xEntry, y: startPoint.y };
        pointF2 = { x: xEntry, y };
        pointF3 = { x: xExit, y };
        pointF4 = { x: xExit, y: startPoint.y };
      }

      // Validar que el bypass no introduzca nuevas colisiones
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

  // ── Refinamiento: eliminar codos superfluos (U-turns innecesarios) ─────────────
  // Equivalente a BaseRouter.cs: RefineSolution

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

  // ── Limpieza de puntos colineales consecutivos ────────────────────────────────

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

  // ── Primitivas geométricas ────────────────────────────────────────────────────

  /**
   * Determina si el punto (x, y) cae dentro de la zona de exclusión de un obstáculo.
   * Zona de exclusión = Bounding Box expandido por `padding` en todas las direcciones.
   *
   * IMPORTANTE: Desigualdades ESTRICTAS (< y >) para evitar colisiones falsas al borde
   * milimétrico del padding ("Beso de la Muerte"). Un punto exactamente sobre el límite
   * se considera FUERA (seguro), lo que permite que los Stubs de 13px descansen
   * exactamente en la frontera sin detonar un zig-zag de rescate.
   */
  private getShapeFromPoint(x: number, y: number): RouterObstacle | null {
    for (const shape of this.obstacles) {
      if (x > shape.x - this.padding.x && x < shape.x + shape.width + this.padding.x &&
          y > shape.y - this.padding.y && y < shape.y + shape.height + this.padding.y) {
        return shape;
      }
    }
    return null;
  }

  /**
   * Devuelve todos los obstáculos cuyo Bounding Box (sin padding) es atravesado
   * por el segmento (startPoint → endPoint).
   *
   * Nota: El router solo maneja segmentos puramente ortogonales (H o V).
   * Un segmento diagonal no debería existir en ningún momento.
   */
  private getIntersectedShapes(startPoint: Point, endPoint: Point): RouterObstacle[] {
    const arr: RouterObstacle[] = [];
    for (const value of this.obstacles) {
      if (startPoint.y === endPoint.y) {
        // Segmento horizontal
        if (startPoint.y > value.y && startPoint.y < value.y + value.height) {
          const minX = Math.min(startPoint.x, endPoint.x);
          const maxX = Math.max(startPoint.x, endPoint.x);
          if (minX < value.x + value.width && maxX > value.x) {
            arr.push(value);
          }
        }
      } else if (startPoint.x === endPoint.x) {
        // Segmento vertical
        if (startPoint.x > value.x && startPoint.x < value.x + value.width) {
          const minY = Math.min(startPoint.y, endPoint.y);
          const maxY = Math.max(startPoint.y, endPoint.y);
          if (minY < value.y + value.height && maxY > value.y) {
            arr.push(value);
          }
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
