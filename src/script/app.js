'use strict';

var memGame = angular.module('myApp', ['ngRoute']);

memGame.config(function ($routeProvider) {
    $routeProvider.when('/splash', {
        templateUrl: 'partial/splash.html',
        controller:  'Splash'
    }).when('/game', {
        templateUrl: 'partial/game.html',
        controller:  'Game'
    }).otherwise({redirectTo: '/splash'});
});

memGame.controller('Splash', function ($scope, $rootScope) {
    $rootScope.grid = 4;
    $scope.root = $rootScope;
});

memGame.controller('Game', function ($scope, $rootScope, $location, $timeout, utils) {
    $scope.array = [];
    $scope.temp = null;
    $scope.current = '';
    $scope.second = '';
    $scope.steps = 0;
    $scope.isTimeout = false;

    var REVEAL = 700,   // how long a matched pair stays face-up before it leaves
        LEAVE  = 400;   // must outlast the .leaving animation in app.less

    $scope.createGrid = function (number) {
        var grid   = [],
            genRow = function (num) {
                var arr = [];
                for (var i = 1; i <= num * num / 2; i++) {
                    arr.splice(arr.length, 0, i, i);
                }
                return arr;
            },
            row    = utils.mixRow(genRow(number));

        for (var i = 0; i < number; i++) {
            var sub = [];
            for (var j = 0; j < number; j++) {
                sub.push({v: row[i * number + j], seen: false});
            }
            grid.push(sub);
        }

        $scope.array = grid;
        $scope.left = number * number;
    };

    $scope.resetOpen = function () {
        $scope.temp = null;
        $scope.current = '';
        $scope.second = '';
    };

    var unlock = function () {
        $scope.isTimeout = false;
    };

    var coords = function (key) {
        var parts = key.split(':');
        return [parseInt(parts[0]), parseInt(parts[1])];
    };

    var remove = function (key) {
        var c = coords(key);
        $scope.array[c[0]][c[1]] = null;
        $scope.left--;
    };

    // Relocates seen-but-unmatched cards into freed cells: the penalty for a wrong guess
    // is that memorised positions stop being reliable.
    $scope.shuffleSeen = function (done) {
        var empty = [], movable = [];

        angular.forEach($scope.array, function (row, i) {
            angular.forEach(row, function (cell, j) {
                var key = i + ':' + j;
                if (!cell) empty.push([i, j]);
                else if (cell.seen && key !== $scope.current && key !== $scope.second) movable.push([i, j]);
            });
        });

        var max = Math.min(empty.length, movable.length);
        if (!max) {
            if (done) done();
            return;
        }

        var count = 1 + Math.floor(Math.random() * max),
            to    = utils.mixRow(empty),
            from  = utils.mixRow(movable),
            moves = [];

        for (var n = 0; n < count; n++) {
            moves.push({from: from[n], to: to[n]});
        }

        // Before mutating, so cardFlight measures the cards where they are still drawn. It only
        // works today because the DOM lags the model until the next digest — do not reorder this.
        // `done` fires when every card has landed, so the board stays locked for the whole flight
        // and a click can never catch one mid-air and flip it open.
        if ($scope.flyMoves) $scope.flyMoves(moves, done);

        angular.forEach(moves, function (move) {
            var card = $scope.array[move.from[0]][move.from[1]];
            $scope.array[move.to[0]][move.to[1]] = card;
            $scope.array[move.from[0]][move.from[1]] = null;
        });

        if (!$scope.flyMoves && done) done();
    };

    $scope.rotate = function (i, j) {
        var cell = $scope.array[i][j],
            key  = i + ':' + j;

        if (!cell || $scope.isTimeout || $scope.current === key) return;

        cell.seen = true;
        $scope.steps++;

        if (!$scope.current) {
            $scope.current = key;
            $scope.temp = cell.v;
            return;
        }

        $scope.second = key;

        if ($scope.temp === cell.v) {
            var pair = [$scope.current, key];
            $scope.isTimeout = true;

            $timeout(function () {
                angular.forEach(pair, function (k) {
                    var c = coords(k);
                    $scope.array[c[0]][c[1]].leaving = true;
                });

                $timeout(function () {
                    angular.forEach(pair, remove);
                    $scope.resetOpen();

                    // The reshuffle waits a tick. Emptying a cell and refilling it inside one
                    // digest means ng-if never observes it empty, so it reuses the vanished card's
                    // element — and the arriving card inherits its open state and flies face-up.
                    // A tick later the cell has actually rendered empty and the arriving card gets
                    // a fresh element.
                    $timeout(function () {
                        $scope.shuffleSeen(unlock);
                    });
                }, LEAVE);
            }, REVEAL);
            return;
        }

        $scope.isTimeout = true;
        $timeout(function () {
            $scope.shuffleSeen(unlock);
            $scope.resetOpen();
        }, 1000);
    };

    // Bound twice in the template, so it runs on every digest: keep it a comparison, not a scan.
    $scope.checkWin = function () {
        return $scope.array.length > 0 && !$scope.left;
    };

    $scope.isOpen = function (i, j) {
        var key = i + ':' + j;
        return $scope.current === key || $scope.second === key;
    };

    $scope.init = function () {
        if (!$rootScope.grid) $location.path('/');
        else $scope.createGrid($rootScope.grid);
    };
    $scope.init();
});

memGame.controller('Control', function ($scope, $location) {
    $scope.stateIs = function (str) {
        return $location.$$path == '/' + str;
    };

    $scope.go = function (path) {
        $location.path(path);
    };
});
