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
    $scope.done = [];
    $scope.temp = null;
    $scope.current = '';
    $scope.steps = 0;
    $scope.isTimeout = false;

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
                sub.push(row[i * number + j]);
            }
            grid.push(sub);
        }

        $scope.array = grid;
    };

    $scope.resetOpen = function () {
        $scope.temp = null;
        $scope.current = '';
        $scope.second = '';
    };

    $scope.rotate = function (i, j) {
        var num = $scope.array[i][j];

        if ($scope.checkWin() || $scope.isTimeout || $scope.current === (i + ':' + j)) return;

        if ($scope.current) $scope.second = i + ':' + j;
        else $scope.current = i + ':' + j;

        if (!$scope.temp) {
            $scope.temp = num;
        }
        else if ($scope.temp === num) {
            $scope.done.push(num);
            $scope.resetOpen();
        } else {
            $scope.isTimeout = true;
            $timeout(function () {
                $scope.isTimeout = false;
                $scope.resetOpen();
            }, 1000);
        }

        $scope.steps++;
    };

    $scope.checkWin = function () {
        return $scope.done.length === $rootScope.grid * $rootScope.grid / 2;
    };

    $scope.isOpen = function (i, j) {
        var num = $scope.array[i][j];
        return (num === $scope.temp && $scope.current === i + ':' + j) || $scope.second === i + ':' + j || $scope.done.indexOf(num) != -1;
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
        console.log($location);
    };
});
