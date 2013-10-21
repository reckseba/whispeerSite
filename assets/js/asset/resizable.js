define(["whispeerHelper"], function (h) {
	"use strict";
	var Resizable = function (boundary) {
		var element = jQuery("<div class='resizable'></div>");
		var body = jQuery(document.body);

		var ourElement = jQuery(boundary.element || body);

		ourElement.append(element);

		if (!boundary.top && !boundary.left && !boundary.right && !boundary.bottom) {
			boundary.top = ourElement.offset().top;
			boundary.left = ourElement.offset().left;
			boundary.right = boundary.left + ourElement.width();
			boundary.bottom = boundary.top + ourElement.height();
		} else if (!boundary.top || !boundary.left || !boundary.right || !boundary.bottom) {
			throw "Invalid boundaries!";
		}

		var position = {
			top: 0,
			left: 0,
			width: 0,
			height: 0
		};

		initSize();
		checkMovePosition();
		setElementPosition(position);

		var resizing = false;
		var moving = false;

		var border = 4;

		var startX = 0;
		var startY = 0;
		var oldPosition;

		function initSize() {
			if (boundary.initSize) {
				position.width = boundary.initSize;
				position.height = boundary.initSize;
			}
		}

		function setElementPosition(position) {
			element.css("top", position.top);
			element.css("left", position.left);
			element.css("height", position.height);
			element.css("width", position.width);
		}

		function setSelect(val) {
			body.css("user-select", val);
			body.css("-ms-user-select", val);
			body.css("-webkit-user-select", val);
			body.css("-moz-user-select", val);
			body.css("-khtml-user-select", val);
			body.css("-o-user-select", val);
		}

		function inElement(x, y) {
			return y > position.top + border &&
				x > position.left + border &&
				y < position.top + position.height - border &&
				x < position.left + position.width - border;
		}

		function onBorder(x, y) {
			if (y > position.top - border && y < position.top + border) {
				return "top";
			}

			if (y > position.top + position.height - border && y < position.top + position.height + border) {
				return "bottom";
			}

			if (x > position.left - border && x < position.left + border) {
				return "left";
			}

			if (x > position.left + position.width - border && x < position.left + position.width + border) {
				return "right";
			}

			return false;
		}

		function checkBorders(position) {
			return {
				left: position.left < boundary.left,
				right: position.left + position.width > boundary.right,
				top: position.top < boundary.top,
				bottom: position.top + position.height > boundary.bottom
			};
		}

		function checkMovePosition() {
			var checkedB = checkBorders(position);

			if (checkedB.top) {
				position.top = boundary.top;
			}

			if (checkedB.bottom) {
				position.top = boundary.bottom - position.height;
			}

			if (checkedB.left) {
				position.left = boundary.left;
			}

			if (checkedB.right) {
				position.left = boundary.right - position.width;
			}
		}

		function checkResizePosition() {
			var checkedB = checkBorders(position);

			var newSize;
			if (checkedB.bottom || checkedB.right) {
				newSize = Math.min(boundary.bottom - position.top, boundary.right - position.left);
				position.height = newSize;
				position.width = newSize;
			}

			//still not sure if we really want to allow resizing to the left/top
			if (checkedB.top || checkedB.left) {
				var bottom = position.top + position.height;
				var right = position.left + position.width;

				newSize = Math.min(bottom - boundary.top, right - boundary.left);
				position.width = newSize;
				position.height = newSize;
				position.top = bottom - newSize;
				position.left = right - newSize;
			}
		}

		function addElementPosition(left, top, size) {
			if (oldPosition.width + size < boundary.minSize) {
				return;
			}

			position.top = oldPosition.top + top;
			position.left = oldPosition.left + left;
			position.width = oldPosition.width + size;
			position.height = oldPosition.height + size;

			if (!size) {
				checkMovePosition();
			} else {
				checkResizePosition();
			}
		}

		function updatePosition(event) {
			if (resizing || moving) {
				var diffX = event.pageX - startX;
				var diffY = event.pageY - startY;

				if (moving) {
					addElementPosition(diffX, diffY, 0);
				} else if (resizing) {
					if (resizing === "top") {
						addElementPosition(diffY, diffY, -diffY);
					} else if (resizing === "bottom") {
						addElementPosition(0, 0, diffY);
					} else if (resizing === "left") {
						addElementPosition(diffX, diffX, -diffX);
					} else if (resizing === "right") {
						addElementPosition(0, 0, diffX);
					}
				}

				setElementPosition(position);
			}
		}

		function mouseDown(event) {
			var x = event.pageX, y = event.pageY;
			if (inElement(x, y)) {
				moving = true;
			}

			resizing = onBorder(x, y);

			if (moving || resizing) {
				oldPosition = h.copyObj(position);
				setSelect("none");

				startX = x;
				startY = y;
			} else {
				setSelect("");
			}
		}

		function mouseUpFunction() {
			resizing = false;
			moving = false;
		}

		var rand = Math.floor(Math.random() * 1000000);

		body.bind("mousemove." + rand, updatePosition);
		body.bind("mousedown." + rand, mouseDown);
		body.bind("mouseup." + rand, mouseUpFunction);

		this.getPosition = function () {
			return h.copyObj(position);
		};

		this.getRelativePosition = function () {
			return {
				top: position.top - boundary.top,
				left: position.left - boundary.left,
				height: position.height,
				width: position.width
			};
		};

		this.kill = function () {
			element.remove();
			body.unbind("." + rand);
		};
	};

	return Resizable;
});